import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

const FIELDS = [
  'is_recorded', 'faculty_id', 'recording_date', 'recording_file_name',
  'recording_duration', 'notes', 'editing_status', 'backup_available',
  'storage_location',
  'upload_youtube', 'upload_youtube_link', 'youtube_privacy',
  'upload_gdrive', 'upload_gdrive_link',
  'upload_student_app', 'upload_student_app_link',
  'upload_harddisk', 'upload_harddisk_location',
];

const BOOL_FIELDS = new Set([
  'is_recorded', 'backup_available', 'upload_youtube', 'upload_gdrive',
  'upload_student_app', 'upload_harddisk',
]);

// Chapters in a stream-subject, each with its recording folded in.
router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_stream_subject_id, nios_subject_id } = req.query;
    // Chapters + recordings root on the subject (shared across every stream the
    // subject is placed in). Still accept a placement id and resolve it.
    let subjectId = nios_subject_id ? Number(nios_subject_id) : null;
    if (!subjectId && nios_stream_subject_id) {
      const p = await sql`SELECT nios_subject_id FROM nios_stream_subjects WHERE id = ${nios_stream_subject_id}`;
      subjectId = p[0]?.nios_subject_id ?? null;
    }
    if (!subjectId) {
      return res.status(400).json({ error: 'nios_subject_id or nios_stream_subject_id is required.' });
    }
    const rows = await sql`
      SELECT ch.id AS nios_chapter_id, ch.title AS chapter_title, ch.chapter_order,
             r.id AS recording_id, r.is_recorded, r.faculty_id, f.name AS faculty_name,
             r.recording_date, r.recording_file_name, r.recording_duration, r.notes,
             r.editing_status, r.backup_available, r.storage_location,
             r.upload_youtube, r.upload_youtube_link, r.youtube_privacy,
             r.upload_gdrive, r.upload_gdrive_link,
             r.upload_student_app, r.upload_student_app_link,
             r.upload_harddisk, r.upload_harddisk_location
      FROM nios_chapters ch
      LEFT JOIN nios_chapter_recordings r ON r.nios_chapter_id = ch.id
      LEFT JOIN faculty f ON f.id = r.faculty_id
      WHERE ch.nios_subject_id = ${subjectId} AND ch.is_active = true
      ORDER BY ch.chapter_order, ch.title
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

// Recording progress across a NIOS syllabus, grouped by subject. Scope to one
// stream with nios_stream_id, or to every stream in a university with
// nios_university_id.
router.get('/overview', auth, async (req, res, next) => {
  try {
    const { nios_university_id, nios_stream_id } = req.query;
    if (!nios_university_id && !nios_stream_id) {
      return res.status(400).json({ error: 'nios_university_id or nios_stream_id is required.' });
    }
    const conditions = [];
    const params = [];
    let i = 1;
    if (nios_stream_id) { conditions.push(`ss.nios_stream_id = $${i++}`); params.push(nios_stream_id); }
    if (nios_university_id) { conditions.push(`st.nios_university_id = $${i++}`); params.push(nios_university_id); }

    const rows = await sql.query(
      `SELECT
        ss.id                 AS nios_stream_subject_id,
        ss.nios_subject_id,
        ss.nios_stream_id,
        st.name               AS stream_name,
        sub.name              AS subject_name,
        ch.id                 AS chapter_id,
        ch.title              AS chapter_title,
        ch.chapter_order,
        (r.id IS NOT NULL AND r.is_recorded)                                     AS recorded,
        (r.id IS NOT NULL AND r.is_recorded AND NOT (
           COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false) OR
           COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false)
        ))                                                                       AS recorded_not_uploaded
      FROM nios_stream_subjects ss
      JOIN  nios_streams  st ON st.id = ss.nios_stream_id
      JOIN  nios_subjects sub ON sub.id = ss.nios_subject_id
      LEFT JOIN nios_chapters ch ON ch.nios_subject_id = ss.nios_subject_id AND ch.is_active = true
      LEFT JOIN nios_chapter_recordings r ON r.nios_chapter_id = ch.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY st.name, sub.name, ch.chapter_order NULLS LAST`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:chapterId', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM nios_chapter_recordings WHERE nios_chapter_id = ${req.params.chapterId}`;
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

router.put('/:chapterId', auth, async (req, res, next) => {
  try {
    const chapterId = req.params.chapterId;
    const chap = await sql`SELECT id, title FROM nios_chapters WHERE id = ${chapterId}`;
    if (!chap[0]) return res.status(404).json({ error: 'Chapter not found.' });

    const v = {};
    for (const key of FIELDS) {
      const raw = req.body[key];
      if (BOOL_FIELDS.has(key)) v[key] = raw ?? false;
      else v[key] = raw || null;
    }

    const rows = await sql`
      INSERT INTO nios_chapter_recordings (
        nios_chapter_id, is_recorded, faculty_id, recording_date, recording_file_name,
        recording_duration, notes, editing_status, backup_available, storage_location,
        upload_youtube, upload_youtube_link, youtube_privacy,
        upload_gdrive, upload_gdrive_link,
        upload_student_app, upload_student_app_link,
        upload_harddisk, upload_harddisk_location, created_by
      ) VALUES (
        ${chapterId}, ${v.is_recorded}, ${v.faculty_id}, ${v.recording_date}, ${v.recording_file_name},
        ${v.recording_duration}, ${v.notes}, ${v.editing_status || 'not_edited'}, ${v.backup_available}, ${v.storage_location},
        ${v.upload_youtube}, ${v.upload_youtube_link}, ${v.youtube_privacy},
        ${v.upload_gdrive}, ${v.upload_gdrive_link},
        ${v.upload_student_app}, ${v.upload_student_app_link},
        ${v.upload_harddisk}, ${v.upload_harddisk_location}, ${req.user.id}
      )
      ON CONFLICT (nios_chapter_id) DO UPDATE SET
        is_recorded = EXCLUDED.is_recorded, faculty_id = EXCLUDED.faculty_id,
        recording_date = EXCLUDED.recording_date, recording_file_name = EXCLUDED.recording_file_name,
        recording_duration = EXCLUDED.recording_duration, notes = EXCLUDED.notes,
        editing_status = EXCLUDED.editing_status, backup_available = EXCLUDED.backup_available,
        storage_location = EXCLUDED.storage_location,
        upload_youtube = EXCLUDED.upload_youtube, upload_youtube_link = EXCLUDED.upload_youtube_link,
        youtube_privacy = EXCLUDED.youtube_privacy,
        upload_gdrive = EXCLUDED.upload_gdrive, upload_gdrive_link = EXCLUDED.upload_gdrive_link,
        upload_student_app = EXCLUDED.upload_student_app, upload_student_app_link = EXCLUDED.upload_student_app_link,
        upload_harddisk = EXCLUDED.upload_harddisk, upload_harddisk_location = EXCLUDED.upload_harddisk_location,
        updated_at = NOW()
      RETURNING *
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'upsert_nios_chapter_recording', 'nios_chapter_recording', rows[0].id,
      `${v.is_recorded ? 'Marked recorded' : 'Updated recording'}: NIOS chapter "${chap[0].title}"`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
