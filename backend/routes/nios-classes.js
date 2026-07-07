import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

const JOIN = `FROM nios_class_entries c
  LEFT JOIN faculty f ON f.id = c.faculty_id
  LEFT JOIN nios_batches b ON b.id = c.nios_batch_id
  LEFT JOIN nios_universities u ON u.id = b.nios_university_id
  LEFT JOIN nios_subjects sub ON sub.id = c.nios_subject_id
  LEFT JOIN nios_chapters nch ON nch.id = c.nios_chapter_id`;

const SELECT_COLS = `c.*, f.name AS faculty_name, b.name AS batch_name,
  u.name AS university_name, sub.name AS subject_name, nch.title AS chapter_title`;

async function niosClassContext(id) {
  const rows = await sql.query(`SELECT ${SELECT_COLS} ${JOIN} WHERE c.id = $1`, [id]);
  return rows[0];
}

function niosClassDetail(row) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  const bits = [
    row.subject_name || 'Subject N/A',
    row.batch_name ? `for ${row.batch_name}` : null,
    row.university_name ? `(${row.university_name})` : null,
    row.faculty_name ? `with ${row.faculty_name}` : null,
  ].filter(Boolean).join(' ');
  return `${bits} on ${row.date}${time}`;
}

function buildFilters(query) {
  const {
    date_from, date_to, faculty_id, nios_university_id, nios_batch_id, nios_subject_id, nios_chapter_id,
    year, class_mode, is_recorded, class_status,
    upload_youtube, upload_student_app,
  } = query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (date_from)           { conditions.push(`c.date >= $${i++}`);               params.push(date_from); }
  if (date_to)             { conditions.push(`c.date <= $${i++}`);               params.push(date_to); }
  if (faculty_id)          { conditions.push(`c.faculty_id = $${i++}`);          params.push(faculty_id); }
  if (nios_university_id)  { conditions.push(`b.nios_university_id = $${i++}`);  params.push(nios_university_id); }
  if (nios_batch_id)       { conditions.push(`c.nios_batch_id = $${i++}`);       params.push(nios_batch_id); }
  if (nios_subject_id)  { conditions.push(`c.nios_subject_id = $${i++}`);  params.push(nios_subject_id); }
  if (nios_chapter_id) { conditions.push(`c.nios_chapter_id = $${i++}`); params.push(nios_chapter_id); }
  if (year)             { conditions.push(`b.year = $${i++}`);            params.push(year); }
  if (class_mode)       { conditions.push(`c.class_mode = $${i++}`);         params.push(class_mode); }
  if (class_status)     { conditions.push(`c.class_status = $${i++}`);       params.push(class_status); }
  if (is_recorded !== undefined && is_recorded !== '') {
    conditions.push(`c.is_recorded = $${i++}`); params.push(is_recorded === 'true');
  }
  if (upload_youtube !== undefined && upload_youtube !== '') {
    conditions.push(`c.upload_youtube = $${i++}`); params.push(upload_youtube === 'true');
  }
  if (upload_student_app !== undefined && upload_student_app !== '') {
    conditions.push(`c.upload_student_app = $${i++}`); params.push(upload_student_app === 'true');
  }

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
        COUNT(*) FILTER (WHERE c.is_recorded = true)::int AS recorded,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours
       ${JOIN} ${where}`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/chapter-recording-overview', auth, async (req, res, next) => {
  try {
    const { nios_batch_id } = req.query;
    if (!nios_batch_id) return res.status(400).json({ error: 'nios_batch_id is required.' });

    const rows = await sql.query(`
      SELECT
        bs.id                  AS nios_batch_subject_id,
        bs.nios_subject_id,
        s.name                 AS subject_name,
        ch.id                  AS chapter_id,
        ch.title               AS chapter_title,
        ch.chapter_order,
        COUNT(c.id)::int                                                               AS total_classes,
        COUNT(c.id) FILTER (WHERE c.is_recorded = true)::int                          AS recorded,
        COUNT(c.id) FILTER (WHERE c.is_recorded = false OR c.is_recorded IS NULL)::int AS not_recorded
      FROM nios_batch_subjects bs
      JOIN  nios_subjects s ON s.id = bs.nios_subject_id
      LEFT JOIN nios_chapters ch ON ch.nios_batch_subject_id = bs.id AND ch.is_active = true
      LEFT JOIN nios_class_entries c ON c.nios_chapter_id = ch.id AND c.nios_batch_id = $1
      WHERE bs.nios_batch_id = $1
      GROUP BY bs.id, bs.nios_subject_id, s.name, ch.id, ch.title, ch.chapter_order
      ORDER BY s.name, ch.chapter_order NULLS LAST
    `, [nios_batch_id]);

    res.json(rows);
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

router.post('/', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id,
      class_mode, platform_used, notes,
      is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
      editing_status,
      upload_student_app, upload_student_app_date, upload_student_app_link,
      upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_harddisk, upload_harddisk_location,
      is_cancelled, class_status,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const rows = await sql`
      INSERT INTO nios_class_entries (
        date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id,
        class_mode, platform_used, notes,
        is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
        editing_status,
        upload_student_app, upload_student_app_date, upload_student_app_link,
        upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
        upload_gdrive, upload_gdrive_link,
        upload_harddisk, upload_harddisk_location,
        is_cancelled, class_status, created_by
      ) VALUES (
        ${date}, ${start_time || null}, ${end_time || null}, ${total_hours || null},
        ${faculty_id || null}, ${nios_batch_id || null}, ${nios_subject_id || null}, ${nios_chapter_id || null},
        ${class_mode || null}, ${platform_used || null}, ${notes || null},
        ${is_recorded ?? false}, ${recording_file_name || null}, ${recording_duration || null},
        ${storage_location || null}, ${recording_link || null}, ${backup_available ?? false},
        ${editing_status || 'not_edited'},
        ${upload_student_app ?? false}, ${upload_student_app_date || null}, ${upload_student_app_link || null},
        ${upload_youtube ?? false}, ${upload_youtube_date || null}, ${upload_youtube_link || null}, ${youtube_privacy || null},
        ${upload_gdrive ?? false}, ${upload_gdrive_link || null},
        ${upload_harddisk ?? false}, ${upload_harddisk_location || null},
        ${is_cancelled ?? false}, ${class_status || 'scheduled'}, ${req.user.id}
      ) RETURNING *
    `;
    const createdCtx = await niosClassContext(rows[0].id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_class', 'nios_class_entry', rows[0].id, `Created NIOS class: ${niosClassDetail(createdCtx)}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const {
      date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id,
      class_mode, platform_used, notes,
      is_recorded, recording_file_name, recording_duration, storage_location, recording_link, backup_available,
      editing_status,
      upload_student_app, upload_student_app_date, upload_student_app_link,
      upload_youtube, upload_youtube_date, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_harddisk, upload_harddisk_location,
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

    const rows = await sql`
      UPDATE nios_class_entries SET
        date = ${date}, start_time = ${start_time || null}, end_time = ${end_time || null},
        total_hours = ${total_hours || null}, faculty_id = ${faculty_id || null},
        nios_batch_id = ${nios_batch_id || null}, nios_subject_id = ${nios_subject_id || null},
        nios_chapter_id = ${nios_chapter_id || null},
        class_mode = ${class_mode || null}, platform_used = ${platform_used || null}, notes = ${notes || null},
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
        is_cancelled = ${is_cancelled ?? false}, class_status = ${status},
        updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });

    if (rows[0].nios_timetable_slot_id) {
      await sql`
        UPDATE nios_timetable_slots SET class_taken_status = ${status}, updated_at = NOW()
        WHERE id = ${rows[0].nios_timetable_slot_id}
      `;
    }

    const updatedCtx = await niosClassContext(rows[0].id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_class', 'nios_class_entry', rows[0].id, `Updated NIOS class: ${niosClassDetail(updatedCtx)}`);
    res.json(rows[0]);
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
    const rows = await sql`DELETE FROM nios_class_entries WHERE id = ${req.params.id} RETURNING *`;
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_class', 'nios_class_entry', rows[0].id, `Deleted NIOS class: ${niosClassDetail(deletedCtx)}`);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

export default router;
