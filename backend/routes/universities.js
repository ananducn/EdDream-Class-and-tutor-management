import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';
  const rows = includeInactive
    ? await sql`SELECT * FROM universities ORDER BY name`
    : await sql`SELECT * FROM universities WHERE is_active = true ORDER BY name`;
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, short_code } = req.body;
  if (!name || !short_code) return res.status(400).json({ error: 'Name and short code are required.' });
  const rows = await sql`
    INSERT INTO universities (name, short_code) VALUES (${name}, ${short_code})
    RETURNING *
  `;
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_university', 'university', rows[0].id, `Created university: ${name}`);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, short_code } = req.body;
  if (!name || !short_code) return res.status(400).json({ error: 'Name and short code are required.' });
  const rows = await sql`
    UPDATE universities SET name = ${name}, short_code = ${short_code}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_university', 'university', rows[0].id, `Updated university: ${name}`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE universities SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_university', 'university', rows[0].id, `Deactivated university: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE universities SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_university', 'university', rows[0].id, `Activated university: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
