import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { mondayOf, dayNameOf, timesOverlap } from '../lib/week.js';

const router = express.Router();

const JOIN = 'FROM class_entries c LEFT JOIN faculty f ON f.id = c.faculty_id LEFT JOIN subjects sub ON sub.id = c.subject_id LEFT JOIN universities u ON u.id = c.university_id LEFT JOIN batches b ON b.id = c.batch_id LEFT JOIN streams st ON st.id = c.stream_id';
const SELECT_COLS = 'c.*, f.name AS faculty_name, sub.name AS subject_name, u.name AS university_name, b.name AS batch_name, st.name AS stream_name';

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
    const {
      date_from, date_to, faculty_id, subject_id, university_id, batch_id,
      class_mode, is_recorded, editing_status, upload_youtube, upload_student_app, payment_status, class_status,
    } = req.query;

    const conditions = [];
    const params = [];
    let i = 1;

    if (date_from)        { conditions.push(`c.date >= $${i++}`);                  params.push(date_from); }
    if (date_to)          { conditions.push(`c.date <= $${i++}`);                  params.push(date_to); }
    if (faculty_id)       { conditions.push(`c.faculty_id = $${i++}`);             params.push(faculty_id); }
    if (subject_id)       { conditions.push(`c.subject_id = $${i++}`);             params.push(subject_id); }
    if (university_id)    { conditions.push(`c.university_id = $${i++}`);          params.push(university_id); }
    if (batch_id)         { conditions.push(`c.batch_id = $${i++}`);               params.push(batch_id); }
    if (class_mode)       { conditions.push(`c.class_mode = $${i++}`);             params.push(class_mode); }
    if (is_recorded !== undefined && is_recorded !== '') {
                            conditions.push(`c.is_recorded = $${i++}`);            params.push(is_recorded === 'true'); }
    if (editing_status)   { conditions.push(`c.editing_status = $${i++}`);         params.push(editing_status); }
    if (upload_youtube !== undefined && upload_youtube !== '') {
                            conditions.push(`c.upload_youtube = $${i++}`);         params.push(upload_youtube === 'true'); }
    if (upload_student_app !== undefined && upload_student_app !== '') {
                            conditions.push(`c.upload_student_app = $${i++}`);     params.push(upload_student_app === 'true'); }
    if (payment_status)   { conditions.push(`c.payment_status = $${i++}`);         params.push(payment_status); }
    if (class_status)     { conditions.push(`c.class_status = $${i++}`);           params.push(class_status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT ${SELECT_COLS} ${JOIN} ${where} ORDER BY c.date DESC, c.start_time DESC`;

    const rows = await sql.query(query, params);
    res.json(rows);
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
      unit_chapter, class_mode, platform_used, notes,
      is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
      editing_status,
      upload_student_app, upload_student_app_date, upload_student_app_link,
      upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_harddisk, upload_harddisk_location,
      payment_status, payment_remarks, is_cancelled, class_status, timetable_slot_id,
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
        unit_chapter, class_mode, platform_used, notes,
        is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
        editing_status,
        upload_student_app, upload_student_app_date, upload_student_app_link,
        upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
        upload_gdrive, upload_gdrive_link,
        upload_harddisk, upload_harddisk_location,
        payment_status, payment_remarks, is_cancelled, class_status, timetable_slot_id, created_by
      ) VALUES (
        ${date}, ${start_time || null}, ${end_time || null}, ${total_hours || null},
        ${faculty_id || null}, ${subject_id || null}, ${university_id || null}, ${batch_id || null}, ${resolvedStream},
        ${unit_chapter || null}, ${class_mode || null}, ${platform_used || null}, ${notes || null},
        ${is_recorded ?? false}, ${recording_file_name || null}, ${recording_duration || null},
        ${storage_location || null}, ${recording_link || null}, ${backup_available ?? false},
        ${editing_status || 'not_edited'},
        ${upload_student_app ?? false}, ${upload_student_app_date || null}, ${upload_student_app_link || null},
        ${upload_youtube ?? false}, ${upload_youtube_date || null}, ${upload_youtube_link || null}, ${youtube_privacy || null},
        ${upload_gdrive ?? false}, ${upload_gdrive_link || null},
        ${upload_harddisk ?? false}, ${upload_harddisk_location || null},
        ${payment_status || 'pending'}, ${payment_remarks || null}, ${is_cancelled ?? false}, ${status}, ${timetable_slot_id || null}, ${req.user.id}
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

    await logActivity(req.user.id, req.user.name, req.user.role, 'create_class', 'class_entry', created.id, `Created class on ${date}`);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id, stream_id,
      unit_chapter, class_mode, platform_used, notes,
      is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
      editing_status,
      upload_student_app, upload_student_app_date, upload_student_app_link,
      upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_harddisk, upload_harddisk_location,
      payment_status, payment_remarks, is_cancelled, class_status,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const status = class_status || 'scheduled';
    const resolvedStream = stream_id || (await streamForBatch(batch_id));

    const rows = await sql`
      UPDATE class_entries SET
        date = ${date}, start_time = ${start_time || null}, end_time = ${end_time || null},
        total_hours = ${total_hours || null}, faculty_id = ${faculty_id || null},
        subject_id = ${subject_id || null}, university_id = ${university_id || null}, batch_id = ${batch_id || null},
        stream_id = ${resolvedStream},
        unit_chapter = ${unit_chapter || null}, class_mode = ${class_mode || null},
        platform_used = ${platform_used || null}, notes = ${notes || null},
        is_recorded = ${is_recorded ?? false}, recording_file_name = ${recording_file_name || null},
        recording_duration = ${recording_duration || null}, storage_location = ${storage_location || null},
        recording_link = ${recording_link || null}, backup_available = ${backup_available ?? false},
        editing_status = ${editing_status || 'not_edited'},
        upload_student_app = ${upload_student_app ?? false},
        upload_student_app_date = ${upload_student_app_date || null},
        upload_student_app_link = ${upload_student_app_link || null},
        upload_youtube = ${upload_youtube ?? false},
        upload_youtube_date = ${upload_youtube_date || null},
        upload_youtube_link = ${upload_youtube_link || null},
        youtube_privacy = ${youtube_privacy || null},
        upload_gdrive = ${upload_gdrive ?? false}, upload_gdrive_link = ${upload_gdrive_link || null},
        upload_harddisk = ${upload_harddisk ?? false}, upload_harddisk_location = ${upload_harddisk_location || null},
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

    await logActivity(req.user.id, req.user.name, req.user.role, 'update_class', 'class_entry', rows[0].id, `Updated class on ${date}`);
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
    const rows = await sql`DELETE FROM class_entries WHERE id = ${req.params.id} RETURNING *`;
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_class', 'class_entry', rows[0].id, `Deleted class on ${rows[0].date}`);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
