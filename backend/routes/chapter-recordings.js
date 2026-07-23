import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Every column a client may set on a chapter recording. Kept in one place so the
// upsert and the payload pick stay in sync.
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

// Chapters in a subject, each with its recording row folded in (or nulls). This
// is what the recording manager lists at the chapter level.
router.get('/', auth, async (req, res, next) => {
  try {
    const { academic_year_subject_id } = req.query;
    if (!academic_year_subject_id) {
      return res.status(400).json({ error: 'academic_year_subject_id is required.' });
    }
    const rows = await sql`
      SELECT ch.id AS chapter_id, ch.title AS chapter_title, ch.chapter_order,
             r.id AS recording_id, r.is_recorded, r.faculty_id, f.name AS faculty_name,
             r.recording_date, r.recording_file_name, r.recording_duration, r.notes,
             r.editing_status, r.backup_available, r.storage_location,
             r.upload_youtube, r.upload_youtube_link, r.youtube_privacy,
             r.upload_gdrive, r.upload_gdrive_link,
             r.upload_student_app, r.upload_student_app_link,
             r.upload_harddisk, r.upload_harddisk_location
      FROM chapters ch
      LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
      LEFT JOIN faculty f ON f.id = r.faculty_id
      WHERE ch.academic_year_subject_id = ${academic_year_subject_id} AND ch.is_active = true
      ORDER BY ch.chapter_order, ch.title
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

// Recording progress across a stream's whole syllabus, grouped so the overview
// page can render per-subject cards and top-line stats. Shared by all batches.
router.get('/overview', auth, async (req, res, next) => {
  try {
    const { stream_id, academic_year_id, semester_id } = req.query;
    if (!stream_id) return res.status(400).json({ error: 'stream_id is required.' });

    const conditions = ['ay.stream_id = $1'];
    const params = [stream_id];
    let i = 2;
    if (academic_year_id) { conditions.push(`ay.id = $${i++}`);           params.push(academic_year_id); }
    if (semester_id)      { conditions.push(`ays.semester_id = $${i++}`); params.push(semester_id); }

    const rows = await sql.query(`
      SELECT
        ays.id                AS academic_year_subject_id,
        ays.subject_id,
        sub.name              AS subject_name,
        ays.semester_id,
        sem.name              AS semester_name,
        ch.id                 AS chapter_id,
        ch.title              AS chapter_title,
        ch.chapter_order,
        (r.id IS NOT NULL AND r.is_recorded)                                     AS recorded,
        (r.id IS NOT NULL AND r.is_recorded AND NOT (
           COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false) OR
           COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false)
        ))                                                                       AS recorded_not_uploaded
      FROM academic_years ay
      JOIN  academic_year_subjects ays ON ays.academic_year_id = ay.id
      JOIN  subjects sub               ON sub.id = ays.subject_id
      LEFT JOIN semesters sem          ON sem.id = ays.semester_id
      LEFT JOIN chapters ch            ON ch.academic_year_subject_id = ays.id AND ch.is_active = true
      LEFT JOIN chapter_recordings r   ON r.chapter_id = ch.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sub.name, ch.chapter_order NULLS LAST
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:chapterId', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM chapter_recordings WHERE chapter_id = ${req.params.chapterId}`;
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// Upsert the single recording row for a chapter. INSERT ... ON CONFLICT keeps it
// idempotent so the editor can always PUT the full form.
router.put('/:chapterId', auth, async (req, res, next) => {
  try {
    const chapterId = req.params.chapterId;
    const chap = await sql`SELECT id, title FROM chapters WHERE id = ${chapterId}`;
    if (!chap[0]) return res.status(404).json({ error: 'Chapter not found.' });

    // Normalise: booleans default false, everything else null when blank.
    const v = {};
    for (const key of FIELDS) {
      const raw = req.body[key];
      if (BOOL_FIELDS.has(key)) v[key] = raw ?? false;
      else v[key] = raw || null;
    }

    const rows = await sql`
      INSERT INTO chapter_recordings (
        chapter_id, is_recorded, faculty_id, recording_date, recording_file_name,
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
      ON CONFLICT (chapter_id) DO UPDATE SET
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
    await logActivity(req.user.id, req.user.name, req.user.role, 'upsert_chapter_recording', 'chapter_recording', rows[0].id,
      `${v.is_recorded ? 'Marked recorded' : 'Updated recording'}: chapter "${chap[0].title}"`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
