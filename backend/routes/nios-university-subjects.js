import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Subjects that make up a NIOS university's shared syllabus. Chapters hang off
// these rows (nios_chapters.nios_university_subject_id), and every batch of the
// university inherits them.
router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id } = req.query;
    if (!nios_university_id) return res.status(400).json({ error: 'nios_university_id is required.' });
    const rows = await sql`
      SELECT us.*, s.name AS subject_name, s.subject_code, s.is_active AS subject_active
      FROM nios_university_subjects us
      JOIN nios_subjects s ON s.id = us.nios_subject_id
      WHERE us.nios_university_id = ${nios_university_id}
      ORDER BY s.name
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

async function names(niosUniversityId, niosSubjectId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM nios_subjects WHERE id = ${niosSubjectId}) AS subject_name,
      (SELECT name FROM nios_universities WHERE id = ${niosUniversityId}) AS university_name
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, nios_subject_id } = req.body;
    if (!nios_university_id || !nios_subject_id) return res.status(400).json({ error: 'nios_university_id and nios_subject_id are required.' });
    const rows = await sql`
      INSERT INTO nios_university_subjects (nios_university_id, nios_subject_id)
      VALUES (${nios_university_id}, ${nios_subject_id})
      ON CONFLICT (nios_university_id, nios_subject_id) DO NOTHING
      RETURNING *
    `;
    if (!rows[0]) return res.status(409).json({ error: 'Subject is already in this university syllabus.' });
    const n = await names(nios_university_id, nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'assign_nios_subject', 'nios_university_subject', rows[0].id,
      `Added subject: ${n.subject_name} to NIOS ${n.university_name}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`DELETE FROM nios_university_subjects WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const n = await names(rows[0].nios_university_id, rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'remove_nios_subject', 'nios_university_subject', rows[0].id,
      `Removed subject: ${n.subject_name} from NIOS ${n.university_name}`);
    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

export default router;
