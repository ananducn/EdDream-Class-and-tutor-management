import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Subjects that make up a NIOS stream's syllabus. Chapters hang off the subject
// itself (nios_chapters.nios_subject_id), so a subject placed in two streams
// shares one chapter list and one set of recordings.
//
// Filter by nios_stream_id for a single stream's syllabus, or by
// nios_university_id to sweep every stream in that university (what the
// recording overview needs).
router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_stream_id, nios_university_id } = req.query;
    if (!nios_stream_id && !nios_university_id) {
      return res.status(400).json({ error: 'nios_stream_id or nios_university_id is required.' });
    }
    const conditions = [];
    const params = [];
    let i = 1;
    if (nios_stream_id) { conditions.push(`ss.nios_stream_id = $${i++}`); params.push(nios_stream_id); }
    if (nios_university_id) { conditions.push(`st.nios_university_id = $${i++}`); params.push(nios_university_id); }
    const rows = await sql.query(
      `SELECT ss.*, s.name AS subject_name, s.subject_code, s.is_active AS subject_active,
              st.name AS stream_name, st.nios_university_id
       FROM nios_stream_subjects ss
       JOIN nios_subjects s ON s.id = ss.nios_subject_id
       JOIN nios_streams  st ON st.id = ss.nios_stream_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

async function names(niosStreamId, niosSubjectId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM nios_subjects WHERE id = ${niosSubjectId}) AS subject_name,
      (SELECT name FROM nios_streams  WHERE id = ${niosStreamId})  AS stream_name
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_stream_id, nios_subject_id } = req.body;
    if (!nios_stream_id || !nios_subject_id) return res.status(400).json({ error: 'nios_stream_id and nios_subject_id are required.' });
    const rows = await sql`
      INSERT INTO nios_stream_subjects (nios_stream_id, nios_subject_id)
      VALUES (${nios_stream_id}, ${nios_subject_id})
      ON CONFLICT (nios_stream_id, nios_subject_id) DO NOTHING
      RETURNING *
    `;
    if (!rows[0]) return res.status(409).json({ error: 'Subject is already in this stream syllabus.' });
    const n = await names(nios_stream_id, nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'assign_nios_subject', 'nios_stream_subject', rows[0].id,
      `Added subject: ${n.subject_name} to NIOS stream ${n.stream_name}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`DELETE FROM nios_stream_subjects WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const n = await names(rows[0].nios_stream_id, rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'remove_nios_subject', 'nios_stream_subject', rows[0].id,
      `Removed subject: ${n.subject_name} from NIOS stream ${n.stream_name}`);
    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

export default router;
