import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { DAYS, dateForSlot, nowInZone } from '../lib/week.js';
import { takenEditLock } from '../lib/editWindow.js';
import { normalizeNiosSlotGroups, normalizeNiosClassGroups } from '../lib/groups.js';

const router = express.Router();

function hoursBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : null;
}

// Aggregated list of every chapter (with its derived subject) attached to a slot
const SLOT_CHAPTERS_AGG = `COALESCE((
    SELECT json_agg(json_build_object(
      'nios_chapter_id', ch.id, 'chapter_title', ch.title,
      'nios_subject_id', s.id, 'subject_name', s.name)
      ORDER BY s.name, ch.chapter_order)
    FROM nios_timetable_slot_chapters sc
    JOIN nios_chapters ch ON ch.id = sc.nios_chapter_id
    JOIN nios_subjects s ON s.id = ch.nios_subject_id
    WHERE sc.nios_timetable_slot_id = ts.id), '[]') AS chapters`;

// Write a slot's chapter set and keep the legacy singular nios_subject_id in sync
// with the first chapter's derived subject.
async function syncSlotChapters(slotId, chapterIds) {
  const ids = Array.isArray(chapterIds) ? chapterIds.filter(Boolean) : [];
  await sql`DELETE FROM nios_timetable_slot_chapters WHERE nios_timetable_slot_id = ${slotId}`;
  for (const cid of ids) {
    await sql`
      INSERT INTO nios_timetable_slot_chapters (nios_timetable_slot_id, nios_chapter_id)
      VALUES (${slotId}, ${cid})
      ON CONFLICT DO NOTHING
    `;
  }
  if (ids.length) {
    const s = await sql`
      SELECT nios_subject_id FROM nios_chapters WHERE id = ${ids[0]}
    `;
    await sql`UPDATE nios_timetable_slots SET nios_subject_id = ${s[0]?.nios_subject_id || null} WHERE id = ${slotId}`;
  }
}

// An existing linked class always takes the slot's faculty, subject, times, day
// and status, so the two records never disagree after an edit. allowCreate=false
// updates an existing class but won't create one, so a plain field edit on a slot
// that never had a class doesn't conjure one.
async function syncNiosClassForSlot(slot, timetable, userId, { allowCreate = true } = {}) {
  const status = slot.class_taken_status;
  const existing = await sql`SELECT id FROM nios_class_entries WHERE nios_timetable_slot_id = ${slot.id}`;
  const slotDate = timetable?.week_start_date
    ? dateForSlot(timetable.week_start_date, slot.day_of_week)
    : null;

  if (existing[0]) {
    await sql`
      UPDATE nios_class_entries SET
        class_status = ${status},
        faculty_id = ${slot.faculty_id || null},
        nios_subject_id = ${slot.nios_subject_id || null},
        start_time = ${slot.start_time || null},
        end_time = ${slot.end_time || null},
        total_hours = ${hoursBetween(slot.start_time, slot.end_time)},
        date = COALESCE(${slotDate}, date),
        updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    // Keep the class's chapter set aligned with the slot's.
    await sql`DELETE FROM nios_class_chapters WHERE nios_class_entry_id = ${existing[0].id}`;
    await sql`
      INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id)
      SELECT ${existing[0].id}, nios_chapter_id
      FROM nios_timetable_slot_chapters WHERE nios_timetable_slot_id = ${slot.id}
      ON CONFLICT DO NOTHING
    `;
    return;
  }

  if (!allowCreate) return;
  if (status === 'not_taken') return;
  if (!timetable?.week_start_date) return;

  const date = slotDate;
  if (!date) return;

  const created = await sql`
    INSERT INTO nios_class_entries (
      date, start_time, end_time, total_hours,
      faculty_id, nios_batch_id, nios_subject_id,
      class_status, nios_timetable_slot_id, created_by
    ) VALUES (
      ${date}, ${slot.start_time || null}, ${slot.end_time || null},
      ${hoursBetween(slot.start_time, slot.end_time)},
      ${slot.faculty_id || null}, ${timetable.nios_batch_id || null},
      ${slot.nios_subject_id || null},
      'taken', ${slot.id}, ${userId}
    ) RETURNING id
  `;
  // Copy the slot's chapters onto the newly created class
  await sql`
    INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id)
    SELECT ${created[0].id}, nios_chapter_id
    FROM nios_timetable_slot_chapters WHERE nios_timetable_slot_id = ${slot.id}
    ON CONFLICT DO NOTHING
  `;
  // Set the class's legacy singular chapter to the first (by subject/order)
  await sql`
    UPDATE nios_class_entries SET nios_chapter_id = (
      SELECT cc.nios_chapter_id FROM nios_class_chapters cc
      JOIN nios_chapters ch ON ch.id = cc.nios_chapter_id
      JOIN nios_subjects s ON s.id = ch.nios_subject_id
      WHERE cc.nios_class_entry_id = ${created[0].id}
      ORDER BY s.name, ch.chapter_order LIMIT 1
    )
    WHERE id = ${created[0].id}
  `;
}

// Removing a slot removes the class it created — nios_class_entries.
// nios_timetable_slot_id is ON DELETE SET NULL, so without this the class row
// would outlive its slot as an orphan. Call BEFORE deleting the slots.
async function deleteNiosClassesForSlots(slotIds) {
  if (!slotIds || slotIds.length === 0) return 0;
  // Remember the class groups involved: a common class created from the NIOS
  // Classes page spreads one nios_class_group_id over several batches, each with
  // its own slot, so removing one slot can leave the rest of that group pointing
  // at a row we are about to delete.
  const doomed = await sql`SELECT id, nios_class_group_id FROM nios_class_entries WHERE nios_timetable_slot_id = ANY(${slotIds})`;
  const gone = await sql`DELETE FROM nios_class_entries WHERE nios_timetable_slot_id = ANY(${slotIds}) RETURNING id`;
  await normalizeNiosClassGroups(doomed.map((c) => c.nios_class_group_id));
  return gone.length;
}

// The timetable for another batch in the SAME week as `source`, creating one if
// that batch has no grid for the week yet. Lets a common slot fan out without the
// user having to visit each batch's timetable first.
async function findOrCreateNiosWeekTimetable(batchId, source, userId) {
  const batch = await sql`SELECT id, name, nios_university_id FROM nios_batches WHERE id = ${batchId}`;
  if (!batch[0]) return null;

  const found = await sql`
    SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
    FROM nios_timetables
    WHERE nios_batch_id = ${batchId} AND week_start_date = ${source.week_start_date}
    ORDER BY created_at LIMIT 1
  `;
  if (found[0]) return { ...found[0], batch_name: batch[0].name };

  const label = `Week of ${source.week_start_date} – ${batch[0].name}`;
  const made = await sql`
    INSERT INTO nios_timetables (name, nios_university_id, nios_batch_id, week_start_date, created_by)
    VALUES (${label}, ${batch[0].nios_university_id}, ${batchId}, ${source.week_start_date}, ${userId})
    RETURNING *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
  `;
  return { ...made[0], batch_name: batch[0].name };
}

// Every slot id that an edit/delete on `slotId` should touch: the whole group for
// a common class, or just the slot itself. Returns [] when the slot doesn't exist
// in the given timetable, so callers can 404.
async function niosGroupSlotIds(slotId, timetableId) {
  const rows = await sql`
    SELECT id, nios_slot_group_id FROM nios_timetable_slots
    WHERE id = ${slotId} AND nios_timetable_id = ${timetableId}
  `;
  if (!rows[0]) return [];
  if (!rows[0].nios_slot_group_id) return [rows[0].id];
  const group = await sql`SELECT id FROM nios_timetable_slots WHERE nios_slot_group_id = ${rows[0].nios_slot_group_id}`;
  return group.map((r) => r.id);
}

// True when `start`–`end` overlaps an existing slot on that day in `timetableId`,
// ignoring any slot in `exceptIds` (the group's own members during an edit).
async function niosSlotClashes({ timetableId, day, start, end, exceptIds = [] }) {
  const sameDay = await sql`
    SELECT id, start_time, end_time FROM nios_timetable_slots
    WHERE nios_timetable_id = ${timetableId} AND day_of_week = ${day}
  `;
  return sameDay.some((s) => {
    if (exceptIds.includes(s.id)) return false;
    if (!start || !end || !s.start_time || !s.end_time) return false;
    return start.slice(0, 5) < s.end_time.slice(0, 5) && s.start_time.slice(0, 5) < end.slice(0, 5);
  });
}

// A slot may only be fanned out to a batch whose stream actually carries every
// subject its chapters belong to — otherwise a Commerce-only subject could be
// scheduled onto a Science batch, which is the whole thing streams exist to stop.
// The UI already filters the picker; this is the same rule at the API boundary.
// Returns an error string, or null when every batch qualifies.
async function batchesMissingSubjects(batchIds, chapterIds) {
  if (!batchIds.length || !chapterIds.length) return null;
  const subjects = await sql`
    SELECT DISTINCT nios_subject_id FROM nios_chapters WHERE id = ANY(${chapterIds})
  `;
  const needed = subjects.map((s) => s.nios_subject_id).filter(Boolean);
  if (!needed.length) return null;

  for (const bId of batchIds) {
    const rows = await sql`
      SELECT b.name AS batch_name, st.name AS stream_name,
             (SELECT array_agg(ss.nios_subject_id)
              FROM nios_stream_subjects ss WHERE ss.nios_stream_id = b.nios_stream_id) AS carried
      FROM nios_batches b
      LEFT JOIN nios_streams st ON st.id = b.nios_stream_id
      WHERE b.id = ${bId}
    `;
    if (!rows[0]) continue;
    const carried = new Set(rows[0].carried || []);
    const missing = needed.filter((sid) => !carried.has(sid));
    if (missing.length) {
      const names = await sql`SELECT name FROM nios_subjects WHERE id = ANY(${missing}) ORDER BY name`;
      return `${rows[0].batch_name} is in the ${rows[0].stream_name || 'unassigned'} stream, which does not carry ${names.map((n) => n.name).join(', ')}.`;
    }
  }
  return null;
}

// Copy a slot's chapter set onto another slot. NIOS slots carry many chapters, so
// a fanned-out copy is only equivalent if those come along too.
async function copySlotChapters(fromSlotId, toSlotId) {
  const chapters = await sql`
    SELECT nios_chapter_id FROM nios_timetable_slot_chapters WHERE nios_timetable_slot_id = ${fromSlotId}
  `;
  await syncSlotChapters(toSlotId, chapters.map((c) => c.nios_chapter_id));
}

// Bring a slot's sharing in line with `desiredBatchIds` (the OTHER batches it
// should belong to). Adds copies for newly ticked batches, deletes the copies of
// unticked ones, and keeps nios_slot_group_id consistent — cleared when the slot
// ends up alone again. `primary` is never removed. Returns the resulting members,
// or { error } if a new batch already has a clashing slot (checked before writing).
async function reconcileNiosSlotGroup({ primary, desiredBatchIds, existing, userId }) {
  const source = await sql`
    SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
    FROM nios_timetables WHERE id = ${primary.nios_timetable_id}
  `;
  if (!source[0]) return existing;

  const withBatch = [];
  for (const slot of existing) {
    const tt = await sql`SELECT nios_batch_id FROM nios_timetables WHERE id = ${slot.nios_timetable_id}`;
    withBatch.push({ slot, batchId: tt[0]?.nios_batch_id ?? null });
  }

  const desired = new Set(desiredBatchIds.filter((b) => b !== source[0].nios_batch_id));
  const keep = withBatch.filter((m) => m.slot.id === primary.id || desired.has(m.batchId));
  const drop = withBatch.filter((m) => m.slot.id !== primary.id && !desired.has(m.batchId));
  const alreadyThere = new Set(keep.map((m) => m.batchId));
  const toAdd = [...desired].filter((b) => !alreadyThere.has(b));

  // Resolve target timetables and pre-check clashes before any write.
  const primaryChapters = (await sql`
    SELECT nios_chapter_id FROM nios_timetable_slot_chapters WHERE nios_timetable_slot_id = ${primary.id}
  `).map((c) => c.nios_chapter_id);
  const mismatch = await batchesMissingSubjects(toAdd, primaryChapters);
  if (mismatch) return { error: mismatch };

  const targets = [];
  for (const bId of toAdd) {
    const target = await findOrCreateNiosWeekTimetable(bId, source[0], userId);
    if (!target) continue;
    if (await niosSlotClashes({
      timetableId: target.id, day: primary.day_of_week,
      start: primary.start_time, end: primary.end_time,
    })) {
      return { error: `A slot already exists on ${primary.day_of_week} at this time for ${target.batch_name}.` };
    }
    targets.push(target);
  }

  if (drop.length > 0) {
    const dropIds = drop.map((m) => m.slot.id);
    await deleteNiosClassesForSlots(dropIds);
    await sql`DELETE FROM nios_timetable_slots WHERE id = ANY(${dropIds})`;
  }

  const members = keep.map((m) => m.slot);
  for (const target of targets) {
    const made = await sql`
      INSERT INTO nios_timetable_slots (nios_timetable_id, day_of_week, start_time, end_time, faculty_id, nios_subject_id, notes, class_taken_status)
      VALUES (${target.id}, ${primary.day_of_week}, ${primary.start_time || null}, ${primary.end_time || null},
              ${primary.faculty_id || null}, ${primary.nios_subject_id || null}, ${primary.notes || null}, ${primary.class_taken_status})
      RETURNING *
    `;
    await copySlotChapters(primary.id, made[0].id);
    if (made[0].class_taken_status !== 'not_taken') {
      await syncNiosClassForSlot(made[0], target, userId);
    }
    members.push(made[0]);
  }

  // One member left means it is no longer a common class.
  const groupId = members.length > 1 ? (primary.nios_slot_group_id || primary.id) : null;
  await sql`UPDATE nios_timetable_slots SET nios_slot_group_id = ${groupId} WHERE id = ANY(${members.map((m) => m.id)})`;
  members.forEach((m) => { m.nios_slot_group_id = groupId; });
  return members;
}

async function niosSlotContext(row, timetableId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM faculty WHERE id = ${row.faculty_id}) AS faculty_name,
      (SELECT name FROM nios_subjects WHERE id = ${row.nios_subject_id}) AS subject_name,
      (SELECT name FROM nios_timetables WHERE id = ${timetableId}) AS timetable_name
  `;
  const chapters = await sql`
    SELECT DISTINCT s.name AS subject_name
    FROM nios_timetable_slot_chapters sc
    JOIN nios_chapters ch ON ch.id = sc.nios_chapter_id
    JOIN nios_subjects s ON s.id = ch.nios_subject_id
    WHERE sc.nios_timetable_slot_id = ${row.id}
  `;
  return { ...rows[0], subject_names: chapters.map((c) => c.subject_name) };
}

function niosSlotDetail(row, ctx) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  const subjectLabel = ctx.subject_names?.length ? ctx.subject_names.join(', ') : (ctx.subject_name || 'Subject N/A');
  return `${subjectLabel} with ${ctx.faculty_name || 'Faculty N/A'} on ${row.day_of_week}${time} — ${ctx.timetable_name || 'timetable N/A'}`;
}

// ── Timetables ────────────────────────────────────────────────────────────────

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, nios_batch_id } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (nios_university_id) { conditions.push(`t.nios_university_id = $${i++}`); params.push(nios_university_id); }
    if (nios_batch_id)      { conditions.push(`t.nios_batch_id = $${i++}`);      params.push(nios_batch_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT t.*, to_char(t.week_start_date, 'YYYY-MM-DD') AS week_start_date,
              u.name AS university_name, b.name AS batch_name
       FROM nios_timetables t
       LEFT JOIN nios_universities u ON u.id = t.nios_university_id
       LEFT JOIN nios_batches b ON b.id = t.nios_batch_id
       ${where}
       ORDER BY t.week_start_date DESC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const timetables = await sql`
      SELECT t.*, to_char(t.week_start_date, 'YYYY-MM-DD') AS week_start_date,
             u.name AS university_name, b.name AS batch_name
      FROM nios_timetables t
      LEFT JOIN nios_universities u ON u.id = t.nios_university_id
      LEFT JOIN nios_batches b ON b.id = t.nios_batch_id
      WHERE t.id = ${req.params.id}
    `;
    if (!timetables[0]) return res.status(404).json({ error: 'Not found.' });

    // shared_batches lists the OTHER batches a common-class slot also belongs to,
    // so the grid can badge it and the edit dialog can pre-tick them.
    const slots = await sql.query(
      `SELECT ts.*, f.name AS faculty_name, sub.name AS subject_name, ${SLOT_CHAPTERS_AGG},
              COALESCE((
                SELECT array_agg(b2.name ORDER BY b2.name)
                FROM nios_timetable_slots ts2
                JOIN nios_timetables t2 ON t2.id = ts2.nios_timetable_id
                JOIN nios_batches b2 ON b2.id = t2.nios_batch_id
                WHERE ts.nios_slot_group_id IS NOT NULL
                  AND ts2.nios_slot_group_id = ts.nios_slot_group_id
                  AND ts2.id <> ts.id
              ), '{}') AS shared_batches,
              COALESCE((
                SELECT array_agg(t2.nios_batch_id)
                FROM nios_timetable_slots ts2
                JOIN nios_timetables t2 ON t2.id = ts2.nios_timetable_id
                WHERE ts.nios_slot_group_id IS NOT NULL
                  AND ts2.nios_slot_group_id = ts.nios_slot_group_id
                  AND ts2.id <> ts.id
              ), '{}') AS shared_batch_ids
       FROM nios_timetable_slots ts
       LEFT JOIN faculty f ON f.id = ts.faculty_id
       LEFT JOIN nios_subjects sub ON sub.id = ts.nios_subject_id
       WHERE ts.nios_timetable_id = $1
       ORDER BY ts.start_time`,
      [req.params.id]
    );
    res.json({ ...timetables[0], slots });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, nios_university_id, nios_batch_id, week_start_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const rows = await sql`
      INSERT INTO nios_timetables (name, nios_university_id, nios_batch_id, week_start_date, created_by)
      VALUES (${name}, ${nios_university_id || null}, ${nios_batch_id || null}, ${week_start_date || null}, ${req.user.id})
      RETURNING *
    `;
    const placeCtx = await sql`
      SELECT
        (SELECT name FROM nios_universities WHERE id = ${nios_university_id || null}) AS university_name,
        (SELECT name FROM nios_batches WHERE id = ${nios_batch_id || null}) AS batch_name
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_timetable', 'nios_timetable', rows[0].id,
      `Created NIOS timetable: ${name}${placeCtx[0].batch_name ? ` for ${placeCtx[0].batch_name}` : ''}${placeCtx[0].university_name ? ` (${placeCtx[0].university_name})` : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, week_start_date } = req.body;
    const rows = await sql`
      UPDATE nios_timetables SET
        name = COALESCE(${name || null}, name),
        week_start_date = COALESCE(${week_start_date || null}, week_start_date)
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_timetable', 'nios_timetable', rows[0].id, `Updated NIOS timetable: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    // Slots cascade with the timetable, so their classes have to go first.
    const slots = await sql`SELECT id, nios_slot_group_id FROM nios_timetable_slots WHERE nios_timetable_id = ${req.params.id}`;
    const slotIds = slots.map((s) => s.id);
    const classesRemoved = await deleteNiosClassesForSlots(slotIds);
    const rows = await sql`DELETE FROM nios_timetables WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    // Those slots may have been members of common classes in other batches.
    await normalizeNiosSlotGroups(slots.map((s) => s.nios_slot_group_id));
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_timetable', 'nios_timetable', rows[0].id,
      `Deleted NIOS timetable: ${rows[0].name}${slotIds.length ? ` (${slotIds.length} slots, ${classesRemoved} linked classes)` : ''}`);
    res.json({ message: 'Deleted.', slots_removed: slotIds.length, classes_removed: classesRemoved });
  } catch (err) { next(err); }
});

// ── Slots ─────────────────────────────────────────────────────────────────────

router.post('/:id/slots', auth, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, faculty_id, nios_subject_id, nios_chapter_ids, notes, class_taken_status, nios_batch_ids } = req.body;
    if (!day_of_week || !DAYS.includes(day_of_week)) {
      return res.status(400).json({ error: 'Valid day_of_week is required.' });
    }
    const chapterIds = Array.isArray(nios_chapter_ids) ? nios_chapter_ids.filter(Boolean) : [];

    const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${req.params.id}`;
    if (!tt[0]) return res.status(404).json({ error: 'Timetable not found.' });

    // A "common class" is the same slot in several batches' grids for the same
    // week. Resolve every extra batch to its own timetable for this week (creating
    // one if that batch has none yet), then write one slot per timetable.
    const extraBatchIds = (Array.isArray(nios_batch_ids) ? nios_batch_ids : [])
      .map(Number)
      .filter((b) => b && b !== tt[0].nios_batch_id);

    const mismatch = await batchesMissingSubjects(extraBatchIds, chapterIds);
    if (mismatch) return res.status(409).json({ error: mismatch });

    const targets = [tt[0]];
    for (const bId of extraBatchIds) {
      const found = await findOrCreateNiosWeekTimetable(bId, tt[0], req.user.id);
      if (found) targets.push(found);
    }

    // Pre-validate every target so one clash aborts the whole group before any
    // row is written — the same all-or-nothing rule the Classes page uses.
    for (const target of targets) {
      if (await niosSlotClashes({ timetableId: target.id, day: day_of_week, start: start_time, end: end_time })) {
        const who = target.id === tt[0].id ? 'this batch' : (target.batch_name || `batch ${target.nios_batch_id}`);
        return res.status(409).json({ error: `A slot already exists on ${day_of_week} at this time for ${who}.` });
      }
    }

    const created = [];
    for (const target of targets) {
      const rows = await sql`
        INSERT INTO nios_timetable_slots (nios_timetable_id, day_of_week, start_time, end_time, faculty_id, nios_subject_id, notes, class_taken_status)
        VALUES (${target.id}, ${day_of_week}, ${start_time || null}, ${end_time || null},
                ${faculty_id || null}, ${nios_subject_id || null}, ${notes || null}, ${class_taken_status || 'scheduled'})
        RETURNING *
      `;
      await syncSlotChapters(rows[0].id, chapterIds);
      if (rows[0].class_taken_status !== 'not_taken') {
        await syncNiosClassForSlot(rows[0], target, req.user.id);
      }
      created.push({ slot: rows[0], timetable: target });
    }

    // Tie the copies together (group id = the first slot's id) so a later edit or
    // delete on any one of them applies to the whole set.
    if (created.length > 1) {
      const groupId = created[0].slot.id;
      const ids = created.map((c) => c.slot.id);
      await sql`UPDATE nios_timetable_slots SET nios_slot_group_id = ${groupId} WHERE id = ANY(${ids})`;
      created.forEach((c) => { c.slot.nios_slot_group_id = groupId; });
    }

    for (const c of created) {
      const ctx = await niosSlotContext(c.slot, c.timetable.id);
      await logActivity(req.user.id, req.user.name, req.user.role, 'add_nios_slot', 'nios_timetable_slot', c.slot.id,
        `Added NIOS slot${created.length > 1 ? ' (common class)' : ''}: ${niosSlotDetail(c.slot, ctx)}`);
    }
    res.status(201).json({ ...created[0].slot, shared_count: created.length });
  } catch (err) { next(err); }
});

router.put('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    // A slot edit writes through to its class, so the taken-class editing window
    // is enforced here too — otherwise the grid's status toggle would bypass it.
    const linkedForEdit = await sql`
      SELECT class_status, date FROM nios_class_entries WHERE nios_timetable_slot_id = ${req.params.slotId}
    `;
    for (const cls of linkedForEdit) {
      const locked = takenEditLock(cls, req.user.role);
      if (locked) return res.status(403).json({ error: locked });
    }

    const { day_of_week, start_time, end_time, faculty_id, nios_subject_id, nios_chapter_ids, notes, class_taken_status, nios_batch_ids } = req.body;

    if (class_taken_status === 'taken') {
      const [tt, existing] = await Promise.all([
        sql`SELECT to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${req.params.id}`,
        sql`SELECT day_of_week, start_time FROM nios_timetable_slots WHERE id = ${req.params.slotId}`,
      ]);
      if (existing[0] && tt[0]?.week_start_date) {
        const slotDate = dateForSlot(tt[0].week_start_date, existing[0].day_of_week);
        const slotTime = (existing[0].start_time || '00:00').slice(0, 5);
        const now = nowInZone();
        if (slotDate > now.date || (slotDate === now.date && slotTime > now.time)) {
          return res.status(409).json({ error: `This class is scheduled for ${slotDate} at ${slotTime}. It can only be marked as taken after that time.` });
        }
      }
    }

    // Partial update: the calendar's quick status toggle sends only
    // class_taken_status, so a field that is absent from the body must keep its
    // current value. A field that IS sent but empty is an explicit clear (the
    // edit dialog removing a faculty), which is why these are CASE WHEN on
    // `!== undefined` rather than COALESCE — COALESCE cannot tell the two apart.
    const rows = await sql`
      UPDATE nios_timetable_slots SET
        day_of_week = COALESCE(${day_of_week || null}, day_of_week),
        start_time = COALESCE(${start_time || null}, start_time),
        end_time = COALESCE(${end_time || null}, end_time),
        faculty_id = CASE WHEN ${faculty_id !== undefined}::boolean THEN ${faculty_id || null}::integer ELSE faculty_id END,
        nios_subject_id = CASE WHEN ${nios_subject_id !== undefined}::boolean THEN ${nios_subject_id || null}::integer ELSE nios_subject_id END,
        notes = CASE WHEN ${notes !== undefined}::boolean THEN ${notes || null}::text ELSE notes END,
        class_taken_status = COALESCE(${class_taken_status || null}, class_taken_status),
        updated_at = NOW()
      WHERE id = ANY(${await niosGroupSlotIds(req.params.slotId, req.params.id)})
      RETURNING *
    `;
    const primary = rows.find((r) => String(r.id) === String(req.params.slotId));
    if (!primary) return res.status(404).json({ error: 'Not found.' });

    // Only rewrite chapters when the client explicitly sends the array (a bare
    // status change from the calendar omits it and must keep existing chapters).
    // A common class shares one chapter set, so every member is rewritten.
    if (Array.isArray(nios_chapter_ids)) {
      const cleaned = nios_chapter_ids.filter(Boolean);
      for (const row of rows) await syncSlotChapters(row.id, cleaned);
    }

    // Changing WHO the slot is shared with. `nios_batch_ids` is the full desired
    // set of OTHER batches; absent means "leave sharing alone".
    let members = rows;
    if (nios_batch_ids !== undefined) {
      members = await reconcileNiosSlotGroup({
        primary,
        desiredBatchIds: Array.isArray(nios_batch_ids) ? nios_batch_ids.map(Number).filter(Boolean) : [],
        existing: rows,
        userId: req.user.id,
      });
      if (members.error) return res.status(409).json({ error: members.error });
    }

    // A common class is edited as a whole, so every batch's copy is re-synced.
    // Any field edit propagates to the linked class, but only an explicit status
    // change may create one that didn't exist.
    for (const row of members) {
      const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${row.nios_timetable_id}`;
      await syncNiosClassForSlot(row, tt[0], req.user.id, { allowCreate: !!class_taken_status });
    }
    const updCtx = await niosSlotContext(primary, primary.nios_timetable_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_slot', 'nios_timetable_slot', primary.id,
      `Updated NIOS slot${members.length > 1 ? ` (common class, ${members.length} batches)` : ''} (status: ${primary.class_taken_status}): ${niosSlotDetail(primary, updCtx)}`);
    res.json({ ...primary, shared_count: members.length });
  } catch (err) { next(err); }
});

router.delete('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    // A common class is removed from every batch it was shared with.
    const ids = await niosGroupSlotIds(req.params.slotId, req.params.id);
    if (ids.length === 0) return res.status(404).json({ error: 'Not found.' });

    // Deleting a slot deletes its classes, so a locked taken class blocks it.
    const linkedForDelete = await sql`
      SELECT class_status, date FROM nios_class_entries WHERE nios_timetable_slot_id = ANY(${ids})
    `;
    for (const cls of linkedForDelete) {
      const locked = takenEditLock(cls, req.user.role);
      if (locked) return res.status(403).json({ error: locked });
    }

    const classesRemoved = await deleteNiosClassesForSlots(ids);
    const rows = await sql`DELETE FROM nios_timetable_slots WHERE id = ANY(${ids}) RETURNING *`;
    const primary = rows.find((r) => String(r.id) === String(req.params.slotId)) || rows[0];
    const delCtx = await niosSlotContext(primary, req.params.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_slot', 'nios_timetable_slot', primary.id,
      `Deleted NIOS slot${rows.length > 1 ? ` (common class, ${rows.length} batches)` : ''}${classesRemoved ? ` and ${classesRemoved} linked class${classesRemoved > 1 ? 'es' : ''}` : ''}: ${niosSlotDetail(primary, delCtx)}`);
    res.json({ message: 'Deleted.', deleted: rows.length, classes_removed: classesRemoved });
  } catch (err) { next(err); }
});

export default router;
