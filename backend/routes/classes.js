import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { mondayOf, dayNameOf, timesOverlap } from '../lib/week.js';

const router = express.Router();

const JOIN = 'FROM class_entries c LEFT JOIN faculty f ON f.id = c.faculty_id LEFT JOIN subjects sub ON sub.id = c.subject_id LEFT JOIN universities u ON u.id = c.university_id LEFT JOIN batches b ON b.id = c.batch_id LEFT JOIN streams st ON st.id = c.stream_id LEFT JOIN chapters ch ON ch.id = c.chapter_id LEFT JOIN academic_years ay ON ay.id = c.academic_year_id LEFT JOIN semesters sem ON sem.id = c.semester_id';
const SELECT_COLS = 'c.*, f.name AS faculty_name, sub.name AS subject_name, u.name AS university_name, b.name AS batch_name, st.name AS stream_name, ch.title AS chapter_title, ay.name AS academic_year_name, sem.name AS semester_name';

function buildClassFilters(query) {
  const {
    date_from, date_to, faculty_id, subject_id, university_id, stream_id, batch_id,
    academic_year_id, semester_id, chapter_id,
    class_mode, class_status,
  } = query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (date_from)        { conditions.push(`c.date >= $${i++}`);             params.push(date_from); }
  if (date_to)          { conditions.push(`c.date <= $${i++}`);             params.push(date_to); }
  if (faculty_id)       { conditions.push(`c.faculty_id = $${i++}`);        params.push(faculty_id); }
  if (subject_id)       { conditions.push(`c.subject_id = $${i++}`);        params.push(subject_id); }
  if (university_id)    { conditions.push(`c.university_id = $${i++}`);     params.push(university_id); }
  if (stream_id)        { conditions.push(`c.stream_id = $${i++}`);         params.push(stream_id); }
  if (batch_id)         { conditions.push(`c.batch_id = $${i++}`);          params.push(batch_id); }
  if (academic_year_id) { conditions.push(`c.academic_year_id = $${i++}`);  params.push(academic_year_id); }
  if (semester_id)      { conditions.push(`c.semester_id = $${i++}`);       params.push(semester_id); }
  if (chapter_id)       { conditions.push(`c.chapter_id = $${i++}`);        params.push(chapter_id); }
  if (class_mode)       { conditions.push(`c.class_mode = $${i++}`);        params.push(class_mode); }
  if (class_status)     { conditions.push(`c.class_status = $${i++}`);      params.push(class_status); }

  return { conditions, params };
}

async function classContext(id) {
  const rows = await sql.query(`SELECT ${SELECT_COLS} ${JOIN} WHERE c.id = $1`, [id]);
  return rows[0];
}

function classDetail(row) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  const bits = [
    row.subject_name || 'Subject N/A',
    row.batch_name ? `for ${row.batch_name}` : null,
    row.university_name ? `(${row.university_name})` : null,
    row.faculty_name ? `with ${row.faculty_name}` : null,
  ].filter(Boolean).join(' ');
  return `${bits} on ${row.date}${time}`;
}

// Resolve the stream for a batch (a batch belongs to exactly one stream).
async function streamForBatch(batchId) {
  if (!batchId) return null;
  const rows = await sql`SELECT stream_id FROM batches WHERE id = ${batchId}`;
  return rows[0]?.stream_id ?? null;
}

// Find the week's timetable for a university+batch, or create one for that week.
async function findOrCreateTimetable({ universityId, batchId, weekStart, userId }) {
  const found = await sql`
    SELECT * FROM timetables
    WHERE university_id = ${universityId} AND batch_id = ${batchId} AND week_start_date = ${weekStart}
    ORDER BY created_at LIMIT 1
  `;
  if (found[0]) return { timetable: found[0], created: false };

  const bRow = await sql`SELECT name FROM batches WHERE id = ${batchId}`;
  const label = `Week of ${weekStart}${bRow[0]?.name ? ` – ${bRow[0].name}` : ''}`;
  const made = await sql`
    INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
    VALUES (${label}, ${universityId}, ${batchId}, ${weekStart}, ${userId})
    RETURNING *
  `;
  return { timetable: made[0], created: true };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { conditions, params } = buildClassFilters(req.query);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT ${SELECT_COLS} ${JOIN} ${where} ORDER BY c.date DESC, c.start_time DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/summary', auth, async (req, res, next) => {
  try {
    const { conditions, params } = buildClassFilters(req.query);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT c.*, f.name AS faculty_name, sub.name AS subject_name, u.name AS university_name,
             b.name AS batch_name, st.name AS stream_name
      FROM class_entries c
      LEFT JOIN faculty f ON f.id = c.faculty_id
      LEFT JOIN subjects sub ON sub.id = c.subject_id
      LEFT JOIN universities u ON u.id = c.university_id
      LEFT JOIN batches b ON b.id = c.batch_id
      LEFT JOIN streams st ON st.id = c.stream_id
      WHERE c.id = ${req.params.id}
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id, stream_id,
      academic_year_id, semester_id, chapter_id,
      unit_chapter, class_mode, platform_used, notes,
      payment_status, payment_remarks,
      is_cancelled, class_status, timetable_slot_id,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const status = class_status || 'scheduled';
    const resolvedStream = stream_id || (await streamForBatch(batch_id));

    // When a class is entered directly (not already created from a slot), mirror it into
    // the week's timetable. Cancelled placeholder entries are not placed on the timetable.
    const autoLink = !timetable_slot_id && !is_cancelled && university_id && batch_id;
    let timetableForSlot = null;
    let dayName = null;

    if (autoLink) {
      const weekStart = mondayOf(date);
      dayName = dayNameOf(date);
      const existing = await sql`
        SELECT * FROM timetables
        WHERE university_id = ${university_id} AND batch_id = ${batch_id} AND week_start_date = ${weekStart}
        ORDER BY created_at LIMIT 1
      `;
      if (existing[0]) {
        const sameDay = await sql`
          SELECT start_time, end_time FROM timetable_slots
          WHERE timetable_id = ${existing[0].id} AND day_of_week = ${dayName}
        `;
        const clash = sameDay.some((s) => timesOverlap(start_time, end_time, s.start_time, s.end_time));
        if (clash) {
          return res.status(409).json({ error: `A class is already scheduled for this batch on ${dayName} at this time.` });
        }
        timetableForSlot = existing[0];
      }
    }

    const rows = await sql`
      INSERT INTO class_entries (
        date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id, stream_id,
        academic_year_id, semester_id, chapter_id,
        unit_chapter, class_mode, platform_used, notes,
        payment_status, payment_remarks,
        is_cancelled, class_status, timetable_slot_id, created_by
      ) VALUES (
        ${date}, ${start_time || null}, ${end_time || null}, ${total_hours || null},
        ${faculty_id || null}, ${subject_id || null}, ${university_id || null}, ${batch_id || null}, ${resolvedStream},
        ${academic_year_id || null}, ${semester_id || null}, ${chapter_id || null},
        ${unit_chapter || null}, ${class_mode || null}, ${platform_used || null}, ${notes || null},
        ${payment_status || 'pending'}, ${payment_remarks || null},
        ${is_cancelled ?? false}, ${status}, ${timetable_slot_id || null}, ${req.user.id}
      ) RETURNING *
    `;
    const created = rows[0];

    // Create the matching timetable slot and link it back to this class.
    if (autoLink) {
      if (!timetableForSlot) {
        const { timetable } = await findOrCreateTimetable({
          universityId: university_id, batchId: batch_id, weekStart: mondayOf(date), userId: req.user.id,
        });
        timetableForSlot = timetable;
      }
      const slot = await sql`
        INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id, notes, class_taken_status)
        VALUES (${timetableForSlot.id}, ${dayName}, ${start_time || null}, ${end_time || null},
                ${faculty_id || null}, ${subject_id || null}, ${notes || null}, ${status})
        RETURNING *
      `;
      const linked = await sql`
        UPDATE class_entries SET timetable_slot_id = ${slot[0].id} WHERE id = ${created.id} RETURNING *
      `;
      created.timetable_slot_id = linked[0].timetable_slot_id;
    }

    const createdCtx = await classContext(created.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_class', 'class_entry', created.id, `Created class: ${classDetail(createdCtx)}`);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id, stream_id,
      academic_year_id, semester_id, chapter_id,
      unit_chapter, class_mode, platform_used, notes,
      payment_status, payment_remarks,
      is_cancelled, class_status,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const status = class_status || 'scheduled';

    if (status === 'taken') {
      const classTime = (start_time || '00:00').slice(0, 5);
      const nowISO = new Date().toISOString();
      const todayUTC = nowISO.slice(0, 10);
      const nowTimeUTC = nowISO.slice(11, 16);
      if (date > todayUTC || (date === todayUTC && classTime > nowTimeUTC)) {
        return res.status(409).json({ error: `This class is scheduled for ${date} at ${classTime}. It can only be marked as taken after that time.` });
      }
    }

    const resolvedStream = stream_id || (await streamForBatch(batch_id));

    const rows = await sql`
      UPDATE class_entries SET
        date = ${date}, start_time = ${start_time || null}, end_time = ${end_time || null},
        total_hours = ${total_hours || null}, faculty_id = ${faculty_id || null},
        subject_id = ${subject_id || null}, university_id = ${university_id || null}, batch_id = ${batch_id || null},
        stream_id = ${resolvedStream},
        academic_year_id = ${academic_year_id || null}, semester_id = ${semester_id || null}, chapter_id = ${chapter_id || null},
        unit_chapter = ${unit_chapter || null}, class_mode = ${class_mode || null},
        platform_used = ${platform_used || null}, notes = ${notes || null},
        payment_status = ${payment_status || 'pending'}, payment_remarks = ${payment_remarks || null},
        is_cancelled = ${is_cancelled ?? false}, class_status = ${status},
        updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });

    // Keep the linked timetable slot's status in sync with the class.
    if (rows[0].timetable_slot_id) {
      await sql`
        UPDATE timetable_slots SET class_taken_status = ${status}, updated_at = NOW()
        WHERE id = ${rows[0].timetable_slot_id}
      `;
    }

    const updatedCtx = await classContext(rows[0].id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_class', 'class_entry', rows[0].id, `Updated class: ${classDetail(updatedCtx)}`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const existing = await sql`SELECT * FROM class_entries WHERE id = ${req.params.id}`;
    if (!existing[0]) return res.status(404).json({ error: 'Not found.' });
    // Admins can delete anything; non-admins can only undo their own cancellations
    const isOwner = existing[0].created_by === req.user.id;
    if (req.user.role !== 'admin' && !(existing[0].is_cancelled && isOwner)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const deletedCtx = await classContext(req.params.id);
    const rows = await sql`DELETE FROM class_entries WHERE id = ${req.params.id} RETURNING *`;
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_class', 'class_entry', rows[0].id, `Deleted class: ${classDetail(deletedCtx)}`);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
