import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { batch_id, include_inactive } = req.query;
    let rows;
    if (batch_id) {
      rows = include_inactive === 'true'
        ? await sql`
            SELECT ay.*, b.name AS batch_name,
              (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.id AND s.is_active = true) AS semester_count
            FROM academic_years ay LEFT JOIN batches b ON b.id = ay.batch_id
            WHERE ay.batch_id = ${batch_id} ORDER BY ay.year_order`
        : await sql`
            SELECT ay.*, b.name AS batch_name,
              (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.id AND s.is_active = true) AS semester_count
            FROM academic_years ay LEFT JOIN batches b ON b.id = ay.batch_id
            WHERE ay.batch_id = ${batch_id} AND ay.is_active = true ORDER BY ay.year_order`;
    } else {
      rows = include_inactive === 'true'
        ? await sql`
            SELECT ay.*, b.name AS batch_name,
              (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.id AND s.is_active = true) AS semester_count
            FROM academic_years ay LEFT JOIN batches b ON b.id = ay.batch_id ORDER BY ay.year_order`
        : await sql`
            SELECT ay.*, b.name AS batch_name,
              (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.id AND s.is_active = true) AS semester_count
            FROM academic_years ay LEFT JOIN batches b ON b.id = ay.batch_id
            WHERE ay.is_active = true ORDER BY ay.year_order`;
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT ay.*, b.name AS batch_name FROM academic_years ay LEFT JOIN batches b ON b.id = ay.batch_id WHERE ay.id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { batch_id, name, year_order } = req.body;
    if (!batch_id || !name) return res.status(400).json({ error: 'batch_id and name are required.' });
    const rows = await sql`
      INSERT INTO academic_years (batch_id, name, year_order)
      VALUES (${batch_id}, ${name}, ${year_order || 1})
      RETURNING *
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_academic_year', 'academic_year', rows[0].id, `Created academic year: ${name}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, year_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const rows = await sql`
      UPDATE academic_years SET name = ${name}, year_order = ${year_order || 1}
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_academic_year', 'academic_year', rows[0].id, `Updated academic year: ${name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE academic_years SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_academic_year', 'academic_year', rows[0].id, `Deactivated academic year: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE academic_years SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_academic_year', 'academic_year', rows[0].id, `Activated academic year: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
