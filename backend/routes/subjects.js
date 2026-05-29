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
          SELECT sub.*, u.name AS university_name, s.name AS stream_name
          FROM subjects sub
          LEFT JOIN universities u ON u.id = sub.university_id
          LEFT JOIN streams s ON s.id = sub.stream_id
          WHERE sub.university_id = ${university_id} ORDER BY sub.name`
      : await sql`
          SELECT sub.*, u.name AS university_name, s.name AS stream_name
          FROM subjects sub
          LEFT JOIN universities u ON u.id = sub.university_id
          LEFT JOIN streams s ON s.id = sub.stream_id
          WHERE sub.university_id = ${university_id} AND sub.is_active = true ORDER BY sub.name`
    : all
      ? await sql`
          SELECT sub.*, u.name AS university_name, s.name AS stream_name
          FROM subjects sub
          LEFT JOIN universities u ON u.id = sub.university_id
          LEFT JOIN streams s ON s.id = sub.stream_id
          ORDER BY sub.name`
      : await sql`
          SELECT sub.*, u.name AS university_name, s.name AS stream_name
          FROM subjects sub
          LEFT JOIN universities u ON u.id = sub.university_id
          LEFT JOIN streams s ON s.id = sub.stream_id
          WHERE sub.is_active = true ORDER BY sub.name`;
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, subject_code, university_id, stream_id, semester } = req.body;
  if (!name || !university_id) return res.status(400).json({ error: 'Name and university are required.' });
  const rows = await sql`
    INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
    VALUES (${name}, ${subject_code || null}, ${university_id}, ${stream_id || null}, ${semester || null})
    RETURNING *
  `;
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_subject', 'subject', rows[0].id, `Created subject: ${name}`);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, subject_code, university_id, stream_id, semester } = req.body;
  if (!name || !university_id) return res.status(400).json({ error: 'Name and university are required.' });
  const rows = await sql`
    UPDATE subjects SET name = ${name}, subject_code = ${subject_code || null},
      university_id = ${university_id}, stream_id = ${stream_id || null}, semester = ${semester || null}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_subject', 'subject', rows[0].id, `Updated subject: ${name}`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE subjects SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_subject', 'subject', rows[0].id, `Deactivated subject: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE subjects SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_subject', 'subject', rows[0].id, `Activated subject: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
