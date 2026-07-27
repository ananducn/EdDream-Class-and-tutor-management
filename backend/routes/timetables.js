import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { DAYS, dateForSlot, nowInZone } from '../lib/week.js';
import { normalizeSlotGroups, normalizeClassGroups } from '../lib/groups.js';

const router = express.Router();

function hoursBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : null;
}

// Keep the class entry linked to a slot in sync with the slot.
// - An existing linked class always takes the slot's faculty, subject, times, day
//   and status, so the two records never disagree after an edit.
// - Marking a slot "scheduled" or "taken" creates a linked class entry if none
//   exists yet; "not_taken" never creates a class on its own.
// - allowCreate=false updates an existing class but won't create one, so a plain
//   field edit on a slot that never had a class doesn't conjure one.
async function syncClassForSlot(slot, timetable, userId, { allowCreate = true } = {}) {
  const status = slot.class_taken_status;
  const existing = await sql`SELECT id FROM class_entries WHERE timetable_slot_id = ${slot.id}`;
  const slotDate = timetable?.week_start_date
    ? dateForSlot(timetable.week_start_date, slot.day_of_week)
    : null;

  if (existing[0]) {
    await sql`
      UPDATE class_entries SET
        class_status = ${status},
        faculty_id = ${slot.faculty_id || null},
        subject_id = ${slot.subject_id || null},
        start_time = ${slot.start_time || null},
        end_time = ${slot.end_time || null},
        total_hours = ${hoursBetween(slot.start_time, slot.end_time)},
        date = COALESCE(${slotDate}, date),
        updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    return;
  }

  if (!allowCreate) return;
  if (status === 'not_taken') return;
  if (!timetable?.week_start_date) return;

  const date = slotDate;
  if (!date) return;

  let streamId = null;
  if (timetable.batch_id) {
    const b = await sql`SELECT stream_id FROM batches WHERE id = ${timetable.batch_id}`;
    streamId = b[0]?.stream_id ?? null;
  }

  await sql`
    INSERT INTO class_entries (
      date, start_time, end_time, total_hours,
      faculty_id, subject_id, university_id, batch_id, stream_id,
      class_status, timetable_slot_id, created_by
    ) VALUES (
      ${date}, ${slot.start_time || null}, ${slot.end_time || null}, ${hoursBetween(slot.start_time, slot.end_time)},
      ${slot.faculty_id || null}, ${slot.subject_id || null}, ${timetable.university_id || null},
      ${timetable.batch_id || null}, ${streamId},
      'taken', ${slot.id}, ${userId}
    )
  `;
}

// The timetable for another batch in the SAME week as `source`, creating one if
// that batch has no grid for the week yet. Used to fan a common class out across
// batches without the user having to visit each batch's timetable first.
async function findOrCreateWeekTimetable(batchId, source, userId) {
  const batch = await sql`SELECT id, name, university_id FROM batches WHERE id = ${batchId}`;
  if (!batch[0]) return null;

  const found = await sql`
    SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
    FROM timetables
    WHERE batch_id = ${batchId} AND week_start_date = ${source.week_start_date}
    ORDER BY created_at LIMIT 1
  `;
  if (found[0]) return { ...found[0], batch_name: batch[0].name };

  const label = `Week of ${source.week_start_date} – ${batch[0].name}`;
  const made = await sql`
    INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
    VALUES (${label}, ${batch[0].university_id}, ${batchId}, ${source.week_start_date}, ${userId})
    RETURNING *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
  `;
  return { ...made[0], batch_name: batch[0].name };
}

// Every slot id that an edit/delete on `slotId` should touch: the whole group for
// a common class, or just the slot itself. Returns [] when the slot doesn't exist
// in the given timetable, so callers can 404.
async function groupSlotIds(slotId, timetableId) {
  const rows = await sql`
    SELECT id, slot_group_id FROM timetable_slots
    WHERE id = ${slotId} AND timetable_id = ${timetableId}
  `;
  if (!rows[0]) return [];
  if (!rows[0].slot_group_id) return [rows[0].id];
  const group = await sql`SELECT id FROM timetable_slots WHERE slot_group_id = ${rows[0].slot_group_id}`;
  return group.map((r) => r.id);
}

// Removing a slot removes the class it created. class_entries.timetable_slot_id is
// ON DELETE SET NULL, so without this the class row would survive the slot as an
// orphan and keep showing up in Class Overview. Call BEFORE deleting the slots.
async function deleteClassesForSlots(slotIds) {
  if (!slotIds || slotIds.length === 0) return 0;
  // Remember the class groups involved: a common class created from the Classes
  // page spreads one class_group_id over several batches, each with its own slot,
  // so removing one slot can leave the rest of that group pointing at a row we are
  // about to delete.
  const doomed = await sql`SELECT id, class_group_id FROM class_entries WHERE timetable_slot_id = ANY(${slotIds})`;
  const gone = await sql`DELETE FROM class_entries WHERE timetable_slot_id = ANY(${slotIds}) RETURNING id`;
  await normalizeClassGroups(doomed.map((c) => c.class_group_id));
  return gone.length;
}

// Bring a slot's sharing in line with `desiredBatchIds` (the OTHER batches it
// should belong to). Adds copies for newly ticked batches, deletes the copies of
// unticked ones, and keeps slot_group_id consistent — cleared when the slot ends
// up alone again. `primary` is never removed. Returns the resulting members, or
// { error } if a new batch already has a clashing slot (checked before writing).
async function reconcileSlotGroup({ primary, desiredBatchIds, existing, userId }) {
  const source = await sql`
    SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
    FROM timetables WHERE id = ${primary.timetable_id}
  `;
  if (!source[0]) return existing;

  // Which batch each current member belongs to.
  const withBatch = [];
  for (const slot of existing) {
    const tt = await sql`SELECT batch_id FROM timetables WHERE id = ${slot.timetable_id}`;
    withBatch.push({ slot, batchId: tt[0]?.batch_id ?? null });
  }

  const desired = new Set(desiredBatchIds.filter((b) => b !== source[0].batch_id));
  const keep = withBatch.filter((m) => m.slot.id === primary.id || desired.has(m.batchId));
  const drop = withBatch.filter((m) => m.slot.id !== primary.id && !desired.has(m.batchId));
  const alreadyThere = new Set(keep.map((m) => m.batchId));
  const toAdd = [...desired].filter((b) => !alreadyThere.has(b));

  // Resolve target timetables and pre-check clashes before any write.
  const targets = [];
  for (const bId of toAdd) {
    const target = await findOrCreateWeekTimetable(bId, source[0], userId);
    if (!target) continue;
    const sameDay = await sql`
      SELECT start_time, end_time FROM timetable_slots
      WHERE timetable_id = ${target.id} AND day_of_week = ${primary.day_of_week}
    `;
    const clash = sameDay.some((s) => {
      if (!primary.start_time || !primary.end_time || !s.start_time || !s.end_time) return false;
      return primary.start_time.slice(0, 5) < s.end_time.slice(0, 5)
          && s.start_time.slice(0, 5) < primary.end_time.slice(0, 5);
    });
    if (clash) {
      return { error: `A slot already exists on ${primary.day_of_week} at this time for ${target.batch_name}.` };
    }
    targets.push(target);
  }

  if (drop.length > 0) {
    const dropIds = drop.map((m) => m.slot.id);
    await deleteClassesForSlots(dropIds);
    await sql`DELETE FROM timetable_slots WHERE id = ANY(${dropIds})`;
  }

  const members = keep.map((m) => m.slot);
  for (const target of targets) {
    const made = await sql`
      INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id, notes, class_taken_status)
      VALUES (${target.id}, ${primary.day_of_week}, ${primary.start_time || null}, ${primary.end_time || null},
              ${primary.faculty_id || null}, ${primary.subject_id || null}, ${primary.notes || null}, ${primary.class_taken_status})
      RETURNING *
    `;
    if (made[0].class_taken_status !== 'not_taken') {
      await syncClassForSlot(made[0], target, userId);
    }
    members.push(made[0]);
  }

  // One member left means it is no longer a common class.
  const groupId = members.length > 1 ? (primary.slot_group_id || primary.id) : null;
  await sql`UPDATE timetable_slots SET slot_group_id = ${groupId} WHERE id = ANY(${members.map((m) => m.id)})`;
  members.forEach((m) => { m.slot_group_id = groupId; });
  return members;
}

async function slotContext(row, timetableId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM faculty WHERE id = ${row.faculty_id}) AS faculty_name,
      (SELECT name FROM subjects WHERE id = ${row.subject_id}) AS subject_name,
      (SELECT name FROM timetables WHERE id = ${timetableId}) AS timetable_name
  `;
  return rows[0];
}

function slotDetail(row, ctx) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  return `${ctx.subject_name || 'Subject N/A'} with ${ctx.faculty_name || 'Faculty N/A'} on ${row.day_of_week}${time} — ${ctx.timetable_name || 'timetable N/A'}`;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { batch_id, academic_year_id, semester_id } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (batch_id)         { conditions.push(`t.batch_id = $${i++}`);         params.push(batch_id); }
    if (academic_year_id) { conditions.push(`t.academic_year_id = $${i++}`); params.push(academic_year_id); }
    if (semester_id)      { conditions.push(`t.semester_id = $${i++}`);      params.push(semester_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT t.*, to_char(t.week_start_date, 'YYYY-MM-DD') AS week_start_date,
              u.name AS university_name, b.name AS batch_name,
              ay.name AS academic_year_name, sem.name AS semester_name
       FROM timetables t
       LEFT JOIN universities u ON u.id = t.university_id
       LEFT JOIN batches b ON b.id = t.batch_id
       LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
       LEFT JOIN semesters sem ON sem.id = t.semester_id
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
             u.name AS university_name, b.name AS batch_name,
             ay.name AS academic_year_name, sem.name AS semester_name
      FROM timetables t
      LEFT JOIN universities u ON u.id = t.university_id
      LEFT JOIN batches b ON b.id = t.batch_id
      LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
      LEFT JOIN semesters sem ON sem.id = t.semester_id
      WHERE t.id = ${req.params.id}
    `;
    if (!timetables[0]) return res.status(404).json({ error: 'Not found.' });

    // shared_batches lists the OTHER batches a common-class slot also belongs to,
    // so the grid can badge it without a second round trip.
    const slots = await sql`
      SELECT ts.*, f.name AS faculty_name, sub.name AS subject_name,
             COALESCE((
               SELECT array_agg(b2.name ORDER BY b2.name)
               FROM timetable_slots ts2
               JOIN timetables t2 ON t2.id = ts2.timetable_id
               JOIN batches b2 ON b2.id = t2.batch_id
               WHERE ts.slot_group_id IS NOT NULL
                 AND ts2.slot_group_id = ts.slot_group_id
                 AND ts2.id <> ts.id
             ), '{}') AS shared_batches,
             COALESCE((
               SELECT array_agg(t2.batch_id)
               FROM timetable_slots ts2
               JOIN timetables t2 ON t2.id = ts2.timetable_id
               WHERE ts.slot_group_id IS NOT NULL
                 AND ts2.slot_group_id = ts.slot_group_id
                 AND ts2.id <> ts.id
             ), '{}') AS shared_batch_ids
      FROM timetable_slots ts
      LEFT JOIN faculty f ON f.id = ts.faculty_id
      LEFT JOIN subjects sub ON sub.id = ts.subject_id
      WHERE ts.timetable_id = ${req.params.id}
      ORDER BY ts.start_time
    `;
    res.json({ ...timetables[0], slots });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, university_id, batch_id, week_start_date, academic_year_id, semester_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const rows = await sql`
      INSERT INTO timetables (name, university_id, batch_id, week_start_date, academic_year_id, semester_id, created_by)
      VALUES (${name}, ${university_id || null}, ${batch_id || null}, ${week_start_date || null},
              ${academic_year_id || null}, ${semester_id || null}, ${req.user.id})
      RETURNING *
    `;
    const placeCtx = await sql`
      SELECT
        (SELECT name FROM universities WHERE id = ${university_id || null}) AS university_name,
        (SELECT name FROM batches WHERE id = ${batch_id || null}) AS batch_name
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_timetable', 'timetable', rows[0].id,
      `Created timetable: ${name}${placeCtx[0].batch_name ? ` for ${placeCtx[0].batch_name}` : ''}${placeCtx[0].university_name ? ` (${placeCtx[0].university_name})` : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, week_start_date } = req.body;
    const rows = await sql`
      UPDATE timetables SET
        name = COALESCE(${name || null}, name),
        week_start_date = COALESCE(${week_start_date || null}, week_start_date)
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_timetable', 'timetable', rows[0].id, `Updated timetable: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    // Slots cascade with the timetable, so their classes have to go first —
    // otherwise deleting a week would leave orphaned class entries behind.
    const slots = await sql`SELECT id, slot_group_id FROM timetable_slots WHERE timetable_id = ${req.params.id}`;
    const slotIds = slots.map((s) => s.id);
    const classesRemoved = await deleteClassesForSlots(slotIds);
    const rows = await sql`DELETE FROM timetables WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    // Common slots in this week may have siblings in other batches — tidy those
    // groups now that some members are gone.
    await normalizeSlotGroups(slots.map((s) => s.slot_group_id));
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_timetable', 'timetable', rows[0].id,
      `Deleted timetable: ${rows[0].name}${slotIds.length ? ` (${slotIds.length} slots, ${classesRemoved} linked classes)` : ''}`);
    res.json({ message: 'Deleted.', slots_removed: slotIds.length, classes_removed: classesRemoved });
  } catch (err) { next(err); }
});

router.post('/:id/slots', auth, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, faculty_id, subject_id, notes, class_taken_status, batch_ids } = req.body;
    if (!day_of_week || !DAYS.includes(day_of_week)) {
      return res.status(400).json({ error: 'Valid day_of_week is required.' });
    }

    const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM timetables WHERE id = ${req.params.id}`;
    if (!tt[0]) return res.status(404).json({ error: 'Timetable not found.' });

    // A "common class" is the same slot in several batches' grids for the same
    // week. Resolve every extra batch to its own timetable for this week (creating
    // one if that batch has none yet), then write one slot per timetable.
    const extraBatchIds = (Array.isArray(batch_ids) ? batch_ids : [])
      .map(Number)
      .filter((b) => b && b !== tt[0].batch_id);

    const targets = [tt[0]];
    for (const bId of extraBatchIds) {
      const found = await findOrCreateWeekTimetable(bId, tt[0], req.user.id);
      if (found) targets.push(found);
    }

    // Pre-validate every target so one clash aborts the whole group before any
    // row is written — same all-or-nothing rule the Classes page uses.
    for (const target of targets) {
      const sameDay = await sql`
        SELECT start_time, end_time FROM timetable_slots
        WHERE timetable_id = ${target.id} AND day_of_week = ${day_of_week}
      `;
      const clash = sameDay.some((s) => {
        if (!start_time || !end_time || !s.start_time || !s.end_time) return false;
        return start_time.slice(0, 5) < s.end_time.slice(0, 5) && s.start_time.slice(0, 5) < end_time.slice(0, 5);
      });
      if (clash) {
        const who = target.id === tt[0].id ? 'this batch' : (target.batch_name || `batch ${target.batch_id}`);
        return res.status(409).json({ error: `A slot already exists on ${day_of_week} at this time for ${who}.` });
      }
    }

    const created = [];
    for (const target of targets) {
      const rows = await sql`
        INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id, notes, class_taken_status)
        VALUES (${target.id}, ${day_of_week}, ${start_time || null}, ${end_time || null},
                ${faculty_id || null}, ${subject_id || null}, ${notes || null}, ${class_taken_status || 'scheduled'})
        RETURNING *
      `;
      if (rows[0].class_taken_status !== 'not_taken') {
        await syncClassForSlot(rows[0], target, req.user.id);
      }
      created.push({ slot: rows[0], timetable: target });
    }

    // Tie the copies together (group id = the first slot's id) so a later edit or
    // delete on any one of them applies to the whole set.
    if (created.length > 1) {
      const groupId = created[0].slot.id;
      const ids = created.map((c) => c.slot.id);
      await sql`UPDATE timetable_slots SET slot_group_id = ${groupId} WHERE id = ANY(${ids})`;
      created.forEach((c) => { c.slot.slot_group_id = groupId; });
    }

    for (const c of created) {
      const ctx = await slotContext(c.slot, c.timetable.id);
      await logActivity(req.user.id, req.user.name, req.user.role, 'add_slot', 'timetable_slot', c.slot.id,
        `Added slot${created.length > 1 ? ' (common class)' : ''}: ${slotDetail(c.slot, ctx)}`);
    }
    res.status(201).json({ ...created[0].slot, shared_count: created.length });
  } catch (err) { next(err); }
});

router.put('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, faculty_id, subject_id, notes, class_taken_status, batch_ids } = req.body;

    if (class_taken_status === 'taken') {
      const [tt, existing] = await Promise.all([
        sql`SELECT to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM timetables WHERE id = ${req.params.id}`,
        sql`SELECT day_of_week, start_time FROM timetable_slots WHERE id = ${req.params.slotId}`,
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
      UPDATE timetable_slots SET
        day_of_week = COALESCE(${day_of_week || null}, day_of_week),
        start_time = COALESCE(${start_time || null}, start_time),
        end_time = COALESCE(${end_time || null}, end_time),
        faculty_id = CASE WHEN ${faculty_id !== undefined}::boolean THEN ${faculty_id || null}::integer ELSE faculty_id END,
        subject_id = CASE WHEN ${subject_id !== undefined}::boolean THEN ${subject_id || null}::integer ELSE subject_id END,
        notes = CASE WHEN ${notes !== undefined}::boolean THEN ${notes || null}::text ELSE notes END,
        class_taken_status = COALESCE(${class_taken_status || null}, class_taken_status),
        updated_at = NOW()
      WHERE id = ANY(${await groupSlotIds(req.params.slotId, req.params.id)})
      RETURNING *
    `;
    const primary = rows.find((r) => String(r.id) === String(req.params.slotId));
    if (!primary) return res.status(404).json({ error: 'Not found.' });

    // Changing WHO the slot is shared with. `batch_ids` is the full desired set of
    // OTHER batches; absent means "leave sharing alone".
    let members = rows;
    if (batch_ids !== undefined) {
      members = await reconcileSlotGroup({
        primary,
        desiredBatchIds: Array.isArray(batch_ids) ? batch_ids.map(Number).filter(Boolean) : [],
        existing: rows,
        userId: req.user.id,
      });
      if (members.error) return res.status(409).json({ error: members.error });
    }

    // A common class is edited as a whole, so every batch's copy is re-synced.
    // Any field edit propagates to the linked class, but only an explicit status
    // change may create one that didn't exist.
    for (const row of members) {
      const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM timetables WHERE id = ${row.timetable_id}`;
      await syncClassForSlot(row, tt[0], req.user.id, { allowCreate: !!class_taken_status });
    }
    const updCtx = await slotContext(primary, primary.timetable_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_slot', 'timetable_slot', primary.id,
      `Updated slot${members.length > 1 ? ` (common class, ${members.length} batches)` : ''} (status: ${primary.class_taken_status}): ${slotDetail(primary, updCtx)}`);
    res.json({ ...primary, shared_count: members.length });
  } catch (err) { next(err); }
});

router.delete('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    // A common class is removed from every batch it was shared with.
    const ids = await groupSlotIds(req.params.slotId, req.params.id);
    if (ids.length === 0) return res.status(404).json({ error: 'Not found.' });
    const classesRemoved = await deleteClassesForSlots(ids);
    const rows = await sql`DELETE FROM timetable_slots WHERE id = ANY(${ids}) RETURNING *`;
    const primary = rows.find((r) => String(r.id) === String(req.params.slotId)) || rows[0];
    const delCtx = await slotContext(primary, req.params.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_slot', 'timetable_slot', primary.id,
      `Deleted slot${rows.length > 1 ? ` (common class, ${rows.length} batches)` : ''}${classesRemoved ? ` and ${classesRemoved} linked class${classesRemoved > 1 ? 'es' : ''}` : ''}: ${slotDetail(primary, delCtx)}`);
    res.json({ message: 'Deleted.', deleted: rows.length, classes_removed: classesRemoved });
  } catch (err) { next(err); }
});

export default router;
