import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Streams (Science, Commerce, …) sit between a NIOS university and its batches.
// The syllabus roots here, so two batches of the same university can carry
// completely different subjects.
router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, include_inactive } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (include_inactive !== 'true') conditions.push('s.is_active = true');
    if (nios_university_id) { conditions.push(`s.nios_university_id = $${i++}`); params.push(nios_university_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT s.*, u.name AS university_name,
              (SELECT COUNT(*) FROM nios_stream_subjects ss WHERE ss.nios_stream_id = s.id) AS subject_count,
              (SELECT COUNT(*) FROM nios_batches b WHERE b.nios_stream_id = s.id AND b.is_active = true) AS batch_count
       FROM nios_streams s
       LEFT JOIN nios_universities u ON u.id = s.nios_university_id
       ${where} ORDER BY s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT s.*, u.name AS university_name
      FROM nios_streams s
      LEFT JOIN nios_universities u ON u.id = s.nios_university_id
      WHERE s.id = ${req.params.id}
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function universityName(id) {
  const rows = await sql`SELECT name FROM nios_universities WHERE id = ${id}`;
  return rows[0]?.name ?? null;
}

// Staff and admins can create; editing and deactivating stay admin-only, matching
// nios-batches.
router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, name } = req.body;
    if (!name || !nios_university_id) return res.status(400).json({ error: 'Name and university are required.' });
    const existing = await sql`
      SELECT id FROM nios_streams
      WHERE nios_university_id = ${nios_university_id} AND LOWER(name) = LOWER(${name})
    `;
    if (existing[0]) return res.status(409).json({ error: 'A stream with that name already exists in this university.' });
    const rows = await sql`
      INSERT INTO nios_streams (nios_university_id, name, created_by)
      VALUES (${nios_university_id}, ${name}, ${req.user.id})
      RETURNING *
    `;
    const uniName = await universityName(nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_stream', 'nios_stream', rows[0].id,
      `Created NIOS stream: ${name} (${uniName || 'University N/A'})`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const current = await sql`SELECT nios_university_id FROM nios_streams WHERE id = ${req.params.id}`;
    if (!current[0]) return res.status(404).json({ error: 'Not found.' });
    const clash = await sql`
      SELECT id FROM nios_streams
      WHERE nios_university_id = ${current[0].nios_university_id}
        AND LOWER(name) = LOWER(${name}) AND id <> ${req.params.id}
    `;
    if (clash[0]) return res.status(409).json({ error: 'A stream with that name already exists in this university.' });
    const rows = await sql`
      UPDATE nios_streams SET name = ${name} WHERE id = ${req.params.id} RETURNING *
    `;
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_stream', 'nios_stream', rows[0].id,
      `Updated NIOS stream: ${name} (${uniName || 'University N/A'})`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_streams SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_stream', 'nios_stream', rows[0].id,
      `Deactivated NIOS stream: ${rows[0].name} (${uniName || 'University N/A'})`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_streams SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_stream', 'nios_stream', rows[0].id,
      `Activated NIOS stream: ${rows[0].name} (${uniName || 'University N/A'})`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
