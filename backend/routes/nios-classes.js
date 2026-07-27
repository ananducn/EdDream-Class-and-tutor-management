import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { nowInZone, hoursBetween, mondayOf, dayNameOf } from '../lib/week.js';

// Hours feed the faculty hours report, so derive them from the times rather than
// trusting whatever the caller posted.
const resolveHours = (start, end, given) => hoursBetween(start, end) ?? (given || null);

// Push a NIOS class's details onto the timetable slot it came from, so the weekly
// grid never disagrees with the class. A changed date can move the class into a
// different week, so the slot is re-homed to that week's grid, creating it if
// needed. Mirrors syncSlotFromClass on the main side.
async function syncNiosSlotFromClass(row, userId) {
  if (!row.nios_timetable_slot_id) return;
  const slot = await sql`SELECT * FROM nios_timetable_slots WHERE id = ${row.nios_timetable_slot_id}`;
  if (!slot[0]) return;

  const dayName = dayNameOf(row.date);
  const weekStart = mondayOf(row.date);
  let timetableId = slot[0].nios_timetable_id;

  if (weekStart && row.nios_batch_id) {
    const current = await sql`
      SELECT nios_batch_id, nios_university_id, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date
      FROM nios_timetables WHERE id = ${timetableId}
    `;
    const moved = !current[0]
      || current[0].week_start_date !== weekStart
      || String(current[0].nios_batch_id) !== String(row.nios_batch_id);
    if (moved) {
      const batch = await sql`SELECT nios_university_id, name FROM nios_batches WHERE id = ${row.nios_batch_id}`;
      if (batch[0]) {
        const found = await sql`
          SELECT id FROM nios_timetables
          WHERE nios_batch_id = ${row.nios_batch_id} AND week_start_date = ${weekStart}
          ORDER BY created_at LIMIT 1
        `;
        if (found[0]) timetableId = found[0].id;
        else {
          const made = await sql`
            INSERT INTO nios_timetables (name, nios_university_id, nios_batch_id, week_start_date, created_by)
            VALUES (${`Week of ${weekStart} – ${batch[0].name}`}, ${batch[0].nios_university_id}, ${row.nios_batch_id}, ${weekStart}, ${userId})
            RETURNING id
          `;
          timetableId = made[0].id;
        }
      }
    }
  }

  await sql`
    UPDATE nios_timetable_slots SET
      nios_timetable_id = ${timetableId},
      day_of_week = COALESCE(${dayName}, day_of_week),
      start_time = ${row.start_time || null},
      end_time = ${row.end_time || null},
      faculty_id = ${row.faculty_id || null},
      nios_subject_id = ${row.nios_subject_id || null},
      class_taken_status = ${row.class_status},
      updated_at = NOW()
    WHERE id = ${row.nios_timetable_slot_id}
  `;
}

const router = express.Router();

const JOIN = `FROM nios_class_entries c
  LEFT JOIN faculty f ON f.id = c.faculty_id
  LEFT JOIN nios_batches b ON b.id = c.nios_batch_id
  LEFT JOIN nios_universities u ON u.id = b.nios_university_id
  LEFT JOIN nios_subjects sub ON sub.id = c.nios_subject_id
  LEFT JOIN nios_chapters nch ON nch.id = c.nios_chapter_id`;

// Aggregated list of every chapter (with its derived subject) attached to a class.
// Chapters now hang off the shared university-subject syllabus.
const CHAPTERS_AGG = `COALESCE((
    SELECT json_agg(json_build_object(
      'nios_chapter_id', ch.id, 'chapter_title', ch.title,
      'nios_subject_id', s.id, 'subject_name', s.name)
      ORDER BY s.name, ch.chapter_order)
    FROM nios_class_chapters cc
    JOIN nios_chapters ch ON ch.id = cc.nios_chapter_id
    JOIN nios_subjects s ON s.id = ch.nios_subject_id
    WHERE cc.nios_class_entry_id = c.id), '[]') AS chapters`;

const SELECT_COLS = `c.*, f.name AS faculty_name, b.name AS batch_name,
  u.name AS university_name, sub.name AS subject_name, nch.title AS chapter_title,
  ${CHAPTERS_AGG}`;

// Sync the legacy singular columns to the first chapter (and its subject) so
// fallback read paths stay coherent. Pass the class-entry id and its chapter ids.
async function syncClassChapters(entryId, chapterIds) {
  const ids = Array.isArray(chapterIds) ? chapterIds.filter(Boolean) : [];
  await sql`DELETE FROM nios_class_chapters WHERE nios_class_entry_id = ${entryId}`;
  for (const cid of ids) {
    await sql`
      INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id)
      VALUES (${entryId}, ${cid})
      ON CONFLICT DO NOTHING
    `;
  }
  const first = ids[0] || null;
  let subjectId = null;
  if (first) {
    const s = await sql`
      SELECT nios_subject_id FROM nios_chapters WHERE id = ${first}
    `;
    subjectId = s[0]?.nios_subject_id || null;
  }
  await sql`
    UPDATE nios_class_entries
    SET nios_chapter_id = ${first}, nios_subject_id = ${subjectId}
    WHERE id = ${entryId}
  `;
}

async function niosClassContext(id) {
  const rows = await sql.query(`SELECT ${SELECT_COLS} ${JOIN} WHERE c.id = $1`, [id]);
  return rows[0];
}

function niosClassDetail(row) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  const chapters = Array.isArray(row.chapters) ? row.chapters : [];
  const subjectNames = [...new Set(chapters.map((c) => c.subject_name).filter(Boolean))];
  const subjectLabel = subjectNames.length ? subjectNames.join(', ') : (row.subject_name || 'Subject N/A');
  const bits = [
    subjectLabel,
    row.batch_name ? `for ${row.batch_name}` : null,
    row.university_name ? `(${row.university_name})` : null,
    row.faculty_name ? `with ${row.faculty_name}` : null,
  ].filter(Boolean).join(' ');
  return `${bits} on ${row.date}${time}`;
}

function buildFilters(query) {
  const {
    date_from, date_to, faculty_id, nios_university_id, nios_batch_id, nios_subject_id, nios_chapter_id,
    year, class_mode, class_status,
  } = query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (date_from)           { conditions.push(`c.date >= $${i++}`);               params.push(date_from); }
  if (date_to)             { conditions.push(`c.date <= $${i++}`);               params.push(date_to); }
  if (faculty_id)          { conditions.push(`c.faculty_id = $${i++}`);          params.push(faculty_id); }
  if (nios_university_id)  { conditions.push(`b.nios_university_id = $${i++}`);  params.push(nios_university_id); }
  if (nios_batch_id)       { conditions.push(`c.nios_batch_id = $${i++}`);       params.push(nios_batch_id); }
  if (nios_subject_id)  {
    conditions.push(`(c.nios_subject_id = $${i} OR EXISTS (
      SELECT 1 FROM nios_class_chapters cc
      JOIN nios_chapters ch ON ch.id = cc.nios_chapter_id
      WHERE cc.nios_class_entry_id = c.id AND ch.nios_subject_id = $${i}))`);
    params.push(nios_subject_id); i++;
  }
  if (nios_chapter_id) {
    conditions.push(`(c.nios_chapter_id = $${i} OR EXISTS (
      SELECT 1 FROM nios_class_chapters cc
      WHERE cc.nios_class_entry_id = c.id AND cc.nios_chapter_id = $${i}))`);
    params.push(nios_chapter_id); i++;
  }
  if (year)             { conditions.push(`b.year = $${i++}`);            params.push(year); }
  if (class_mode)       { conditions.push(`c.class_mode = $${i++}`);         params.push(class_mode); }
  if (class_status)     { conditions.push(`c.class_status = $${i++}`);       params.push(class_status); }

  return { conditions, params };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { conditions, params } = buildFilters(req.query);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT ${SELECT_COLS} ${JOIN} ${where} ORDER BY c.date DESC, c.start_time DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/summary', auth, async (req, res, next) => {
  try {
    const { conditions, params } = buildFilters(req.query);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.class_status = 'taken')::int AS taken,
        COUNT(*) FILTER (WHERE c.class_status = 'not_taken')::int AS not_taken,
        COUNT(*) FILTER (WHERE c.class_status = 'scheduled')::int AS scheduled,
        COUNT(*) FILTER (WHERE c.is_cancelled = true)::int AS cancelled,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours
       ${JOIN} ${where}`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql.query(
      `SELECT ${SELECT_COLS} ${JOIN} WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Insert one NIOS class row for a single batch and sync its chapter set.
async function insertNiosClass(fields, userId, chapterIds) {
  const {
    date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id,
    class_mode, platform_used, notes, payment_status, payment_remarks, is_cancelled, class_status, nios_class_group_id,
  } = fields;
  const rows = await sql`
    INSERT INTO nios_class_entries (
      date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id,
      class_mode, platform_used, notes,
      payment_status, payment_remarks,
      is_cancelled, class_status, nios_class_group_id, created_by
    ) VALUES (
      ${date}, ${start_time || null}, ${end_time || null}, ${resolveHours(start_time, end_time, total_hours)},
      ${faculty_id || null}, ${nios_batch_id || null}, ${nios_subject_id || null}, ${nios_chapter_id || null},
      ${class_mode || null}, ${platform_used || null}, ${notes || null},
      ${payment_status || 'pending'}, ${payment_remarks || null},
      ${is_cancelled ?? false}, ${class_status || 'scheduled'}, ${nios_class_group_id || null}, ${userId}
    ) RETURNING *
  `;
  await syncClassChapters(rows[0].id, chapterIds);
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { date, nios_batch_id, nios_batch_ids, nios_chapter_id, nios_chapter_ids } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const chapterIds = Array.isArray(nios_chapter_ids) ? nios_chapter_ids.filter(Boolean) : (nios_chapter_id ? [nios_chapter_id] : []);

    // A common-subject class fans out across many batches of the university.
    const multi = Array.isArray(nios_batch_ids) && nios_batch_ids.length > 0;
    const targetBatches = (multi ? nios_batch_ids : [nios_batch_id]).filter(Boolean);
    if (targetBatches.length === 0) return res.status(400).json({ error: 'At least one batch is required.' });

    const created = [];
    for (const bId of targetBatches) {
      created.push(await insertNiosClass({ ...req.body, nios_batch_id: bId }, req.user.id, chapterIds));
    }

    if (created.length > 1) {
      const groupId = created[0].id;
      const ids = created.map((c) => c.id);
      await sql`UPDATE nios_class_entries SET nios_class_group_id = ${groupId} WHERE id = ANY(${ids})`;
    }

    for (const c of created) {
      const ctx = await niosClassContext(c.id);
      await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_class', 'nios_class_entry', c.id, `Created NIOS class: ${niosClassDetail(ctx)}`);
    }
    const firstCtx = await niosClassContext(created[0].id);
    res.status(201).json(multi ? { ...firstCtx, count: created.length } : firstCtx);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id, nios_chapter_ids,
      class_mode, platform_used, notes,
      payment_status, payment_remarks,
      is_cancelled, class_status,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const chapterIds = Array.isArray(nios_chapter_ids) ? nios_chapter_ids.filter(Boolean) : (nios_chapter_id ? [nios_chapter_id] : []);

    const status = class_status || 'scheduled';
    if (status === 'taken') {
      const classTime = (start_time || '00:00').slice(0, 5);
      const now = nowInZone();
      if (date > now.date || (date === now.date && classTime > now.time)) {
        return res.status(409).json({ error: `This class is scheduled for ${date} at ${classTime}. It can only be marked as taken after that time.` });
      }
    }

    const existing = await sql`SELECT nios_class_group_id FROM nios_class_entries WHERE id = ${req.params.id}`;
    if (!existing[0]) return res.status(404).json({ error: 'Not found.' });
    const groupId = existing[0].nios_class_group_id;

    let rows;
    if (groupId) {
      // Grouped (common-subject) class: apply the shared edit to every row in the
      // group, leaving each row's own nios_batch_id intact.
      rows = await sql`
        UPDATE nios_class_entries SET
          date = ${date}, start_time = ${start_time || null}, end_time = ${end_time || null},
          total_hours = ${resolveHours(start_time, end_time, total_hours)}, faculty_id = ${faculty_id || null},
          nios_subject_id = ${nios_subject_id || null}, nios_chapter_id = ${nios_chapter_id || null},
          class_mode = ${class_mode || null}, platform_used = ${platform_used || null}, notes = ${notes || null},
          payment_status = ${payment_status || 'pending'}, payment_remarks = ${payment_remarks || null},
          is_cancelled = ${is_cancelled ?? false}, class_status = ${status},
          updated_at = NOW()
        WHERE nios_class_group_id = ${groupId} RETURNING *
      `;
    } else {
      rows = await sql`
        UPDATE nios_class_entries SET
          date = ${date}, start_time = ${start_time || null}, end_time = ${end_time || null},
          total_hours = ${resolveHours(start_time, end_time, total_hours)}, faculty_id = ${faculty_id || null},
          nios_batch_id = ${nios_batch_id || null}, nios_subject_id = ${nios_subject_id || null},
          nios_chapter_id = ${nios_chapter_id || null},
          class_mode = ${class_mode || null}, platform_used = ${platform_used || null}, notes = ${notes || null},
          payment_status = ${payment_status || 'pending'}, payment_remarks = ${payment_remarks || null},
          is_cancelled = ${is_cancelled ?? false}, class_status = ${status},
          updated_at = NOW()
        WHERE id = ${req.params.id} RETURNING *
      `;
    }
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });

    for (const r of rows) await syncClassChapters(r.id, chapterIds);

    // Keep each row's linked slot in sync — faculty, subject and times included,
    // not just the status.
    for (const r of rows) {
      await syncNiosSlotFromClass(r, req.user.id);
    }

    const target = rows.find((r) => String(r.id) === String(req.params.id)) || rows[0];
    const updatedCtx = await niosClassContext(target.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_class', 'nios_class_entry', target.id, `Updated NIOS class: ${niosClassDetail(updatedCtx)}`);
    res.json(updatedCtx);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const existing = await sql`SELECT * FROM nios_class_entries WHERE id = ${req.params.id}`;
    if (!existing[0]) return res.status(404).json({ error: 'Not found.' });
    const isOwner = existing[0].created_by === req.user.id;
    if (req.user.role !== 'admin' && !(existing[0].is_cancelled && isOwner)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const deletedCtx = await niosClassContext(req.params.id);
    const groupId = existing[0].nios_class_group_id;
    const rows = groupId
      ? await sql`DELETE FROM nios_class_entries WHERE nios_class_group_id = ${groupId} RETURNING *`
      : await sql`DELETE FROM nios_class_entries WHERE id = ${req.params.id} RETURNING *`;

    // The class takes its timetable slot with it, mirroring the slot-side rule
    // that deleting a slot deletes its class.
    const slotIds = rows.map((r) => r.nios_timetable_slot_id).filter(Boolean);
    let slotsRemoved = 0;
    if (slotIds.length) {
      const goneSlots = await sql`DELETE FROM nios_timetable_slots WHERE id = ANY(${slotIds}) RETURNING id`;
      slotsRemoved = goneSlots.length;
    }

    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_class', 'nios_class_entry', req.params.id,
      `Deleted NIOS class: ${niosClassDetail(deletedCtx)}${groupId ? ` (+${rows.length - 1} linked)` : ''}${slotsRemoved ? ` and ${slotsRemoved} timetable slot${slotsRemoved > 1 ? 's' : ''}` : ''}`);
    res.json({ message: 'Deleted.', count: rows.length, slots_removed: slotsRemoved });
  } catch (err) { next(err); }
});

export default router;
