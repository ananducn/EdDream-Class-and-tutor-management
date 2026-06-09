import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { academic_year_id, include_inactive } = req.query;
    if (!academic_year_id) return res.status(400).json({ error: 'academic_year_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT s.*,
            (SELECT COUNT(*) FROM academic_year_subjects ays WHERE ays.semester_id = s.id) AS subject_count
          FROM semesters s
          WHERE s.academic_year_id = ${academic_year_id}
          ORDER BY s.semester_order`
      : await sql`
          SELECT s.*,
            (SELECT COUNT(*) FROM academic_year_subjects ays WHERE ays.semester_id = s.id) AS subject_count
          FROM semesters s
          WHERE s.academic_year_id = ${academic_year_id} AND s.is_active = true
          ORDER BY s.semester_order`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { academic_year_id, name, semester_order } = req.body;
    if (!academic_year_id || !name) return res.status(400).json({ error: 'academic_year_id and name are required.' });
    const rows = await sql`
      INSERT INTO semesters (academic_year_id, name, semester_order)
      VALUES (${academic_year_id}, ${name}, ${semester_order || 1})
      RETURNING *
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_semester', 'semester', rows[0].id, `Created semester: ${name}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, semester_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const rows = await sql`
      UPDATE semesters SET name = ${name}, semester_order = ${semester_order || 1}
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_semester', 'semester', rows[0].id, `Updated semester: ${name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE semesters SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_semester', 'semester', rows[0].id, `Deactivated semester: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE semesters SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_semester', 'semester', rows[0].id, `Activated semester: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
