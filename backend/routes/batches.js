import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { university_id, stream_id, include_inactive } = req.query;
  const all = include_inactive === 'true';

  const conditions = [];
  const params = [];
  let i = 1;
  if (!all) conditions.push('b.is_active = true');
  if (university_id) { conditions.push(`b.university_id = $${i++}`); params.push(university_id); }
  if (stream_id)     { conditions.push(`b.stream_id = $${i++}`);     params.push(stream_id); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await sql.query(
    `SELECT b.*, u.name AS university_name, s.name AS stream_name
     FROM batches b
     LEFT JOIN universities u ON u.id = b.university_id
     LEFT JOIN streams s ON s.id = b.stream_id
     ${where} ORDER BY b.name`,
    params
  );
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, university_id, stream_id } = req.body;
  if (!name || !university_id || !stream_id) return res.status(400).json({ error: 'Name, university, and stream are required.' });
  const rows = await sql`
    INSERT INTO batches (name, university_id, stream_id)
    VALUES (${name}, ${university_id}, ${stream_id})
    RETURNING *
  `;
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_batch', 'batch', rows[0].id, `Created batch: ${name}`);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, university_id, stream_id } = req.body;
  if (!name || !university_id || !stream_id) return res.status(400).json({ error: 'Name, university, and stream are required.' });
  const rows = await sql`
    UPDATE batches SET name = ${name}, university_id = ${university_id}, stream_id = ${stream_id}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_batch', 'batch', rows[0].id, `Updated batch: ${name}`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE batches SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_batch', 'batch', rows[0].id, `Deactivated batch: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE batches SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_batch', 'batch', rows[0].id, `Activated batch: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
