import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { academic_year_id, subject_id, semester_id } = req.query;

    // Filter by semester — subjects assigned to a specific semester
    if (semester_id) {
      const rows = await sql`
        SELECT ays.*, s.name AS subject_name, s.subject_code,
               u.name AS university_name, st.name AS stream_name
        FROM academic_year_subjects ays
        JOIN subjects s ON s.id = ays.subject_id
        LEFT JOIN universities u ON u.id = s.university_id
        LEFT JOIN streams st ON st.id = s.stream_id
        WHERE ays.semester_id = ${semester_id}
        ORDER BY s.name
      `;
      return res.json(rows);
    }

    // By subject: return all years this subject is assigned to, with batch info
    if (subject_id) {
      const rows = await sql`
        SELECT ays.*, ay.name AS academic_year_name, ay.year_order, ay.batch_id,
               b.name AS batch_name, b.university_id,
               u.name AS university_name, st.name AS stream_name
        FROM academic_year_subjects ays
        JOIN academic_years ay ON ay.id = ays.academic_year_id
        JOIN batches b ON b.id = ay.batch_id
        LEFT JOIN universities u ON u.id = b.university_id
        LEFT JOIN streams st ON st.id = b.stream_id
        WHERE ays.subject_id = ${subject_id}
        ORDER BY b.name, ay.year_order
      `;
      return res.json(rows);
    }

    if (!academic_year_id) return res.status(400).json({ error: 'academic_year_id or subject_id is required.' });
    // When filtering by academic_year_id, return only direct subjects (semester_id IS NULL)
    // so that semester-mode years don't mix subjects from different semesters.
    const rows = await sql`
      SELECT ays.*, s.name AS subject_name, s.subject_code,
             u.name AS university_name, st.name AS stream_name
      FROM academic_year_subjects ays
      JOIN subjects s ON s.id = ays.subject_id
      LEFT JOIN universities u ON u.id = s.university_id
      LEFT JOIN streams st ON st.id = s.stream_id
      WHERE ays.academic_year_id = ${academic_year_id} AND ays.semester_id IS NULL
      ORDER BY s.name
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

async function yearSubjectNames(subjectId, academicYearId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM subjects WHERE id = ${subjectId}) AS subject_name,
      (SELECT name FROM academic_years WHERE id = ${academicYearId}) AS academic_year_name,
      (SELECT b.name FROM academic_years ay JOIN batches b ON b.id = ay.batch_id WHERE ay.id = ${academicYearId}) AS batch_name
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { academic_year_id, subject_id, semester_id } = req.body;
    if (!academic_year_id || !subject_id) return res.status(400).json({ error: 'academic_year_id and subject_id are required.' });
    const rows = await sql`
      INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id)
      VALUES (${academic_year_id}, ${subject_id}, ${semester_id || null})
      RETURNING *
    `.catch((err) => {
      if (err.message?.includes('unique')) throw { status: 409, message: 'Subject is already in this academic year.' };
      throw err;
    });
    const names = await yearSubjectNames(subject_id, academic_year_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'add_year_subject', 'academic_year_subject', rows[0].id,
      `Added subject: ${names.subject_name} to ${names.academic_year_name} (${names.batch_name})`);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`DELETE FROM academic_year_subjects WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const names = await yearSubjectNames(rows[0].subject_id, rows[0].academic_year_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'remove_year_subject', 'academic_year_subject', rows[0].id,
      `Removed subject: ${names.subject_name} from ${names.academic_year_name} (${names.batch_name})`);
    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

export default router;
