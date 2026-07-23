import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Academic years belong to a STREAM and are shared by every batch of that stream.
router.get('/', auth, async (req, res, next) => {
  try {
    const { stream_id, include_inactive } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (stream_id) { conditions.push(`ay.stream_id = $${i++}`); params.push(stream_id); }
    if (include_inactive !== 'true') conditions.push('ay.is_active = true');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await sql.query(
      `SELECT ay.*, st.name AS stream_name,
        (SELECT COUNT(*) FROM semesters s WHERE s.academic_year_id = ay.id AND s.is_active = true) AS semester_count
       FROM academic_years ay LEFT JOIN streams st ON st.id = ay.stream_id
       ${where} ORDER BY ay.year_order`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT ay.*, st.name AS stream_name FROM academic_years ay LEFT JOIN streams st ON st.id = ay.stream_id WHERE ay.id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function streamName(id) {
  const rows = await sql`SELECT name FROM streams WHERE id = ${id}`;
  return rows[0]?.name ?? null;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { stream_id, name, year_order } = req.body;
    if (!stream_id || !name) return res.status(400).json({ error: 'stream_id and name are required.' });
    const rows = await sql`
      INSERT INTO academic_years (stream_id, name, year_order)
      VALUES (${stream_id}, ${name}, ${year_order || 1})
      RETURNING *
    `;
    const sName = await streamName(stream_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_academic_year', 'academic_year', rows[0].id,
      `Created academic year: ${name} for stream ${sName || 'N/A'}`);
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
    const sName = await streamName(rows[0].stream_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_academic_year', 'academic_year', rows[0].id,
      `Updated academic year: ${name} for stream ${sName || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE academic_years SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const sName = await streamName(rows[0].stream_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_academic_year', 'academic_year', rows[0].id,
      `Deactivated academic year: ${rows[0].name} for stream ${sName || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE academic_years SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const sName = await streamName(rows[0].stream_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_academic_year', 'academic_year', rows[0].id,
      `Activated academic year: ${rows[0].name} for stream ${sName || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
