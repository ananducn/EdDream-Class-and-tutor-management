import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { university_id, include_inactive } = req.query;
  const all = include_inactive === 'true';
  const rows = university_id
    ? all
      ? await sql`
          SELECT s.*, u.name AS university_name
          FROM streams s LEFT JOIN universities u ON u.id = s.university_id
          WHERE s.university_id = ${university_id} ORDER BY s.name`
      : await sql`
          SELECT s.*, u.name AS university_name
          FROM streams s LEFT JOIN universities u ON u.id = s.university_id
          WHERE s.university_id = ${university_id} AND s.is_active = true ORDER BY s.name`
    : all
      ? await sql`
          SELECT s.*, u.name AS university_name
          FROM streams s LEFT JOIN universities u ON u.id = s.university_id
          ORDER BY s.name`
      : await sql`
          SELECT s.*, u.name AS university_name
          FROM streams s LEFT JOIN universities u ON u.id = s.university_id
          WHERE s.is_active = true ORDER BY s.name`;
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, university_id } = req.body;
  if (!name || !university_id) return res.status(400).json({ error: 'Name and university are required.' });
  const rows = await sql`
    INSERT INTO streams (name, university_id) VALUES (${name}, ${university_id})
    RETURNING *
  `;
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_stream', 'stream', rows[0].id, `Created stream: ${name}`);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, university_id } = req.body;
  if (!name || !university_id) return res.status(400).json({ error: 'Name and university are required.' });
  const rows = await sql`
    UPDATE streams SET name = ${name}, university_id = ${university_id}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_stream', 'stream', rows[0].id, `Updated stream: ${name}`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE streams SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_stream', 'stream', rows[0].id, `Deactivated stream: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE streams SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_stream', 'stream', rows[0].id, `Activated stream: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
