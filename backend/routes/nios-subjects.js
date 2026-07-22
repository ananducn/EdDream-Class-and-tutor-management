import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { include_inactive } = req.query;
    const rows = include_inactive === 'true'
      ? await sql`SELECT * FROM nios_subjects ORDER BY name`
      : await sql`SELECT * FROM nios_subjects WHERE is_active = true ORDER BY name`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM nios_subjects WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Staff and admins can create; editing and deactivating stay admin-only.
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, subject_code } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const rows = await sql`
      INSERT INTO nios_subjects (name, subject_code, created_by)
      VALUES (${name}, ${subject_code || null}, ${req.user.id})
      RETURNING *
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_subject', 'nios_subject', rows[0].id,
      `Created NIOS subject: ${name}${subject_code ? ` (${subject_code})` : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const { name, subject_code } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const rows = await sql`
      UPDATE nios_subjects SET name = ${name}, subject_code = ${subject_code || null}
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_subject', 'nios_subject', rows[0].id,
      `Updated NIOS subject: ${name}${subject_code ? ` (${subject_code})` : ''}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_subjects SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_subject', 'nios_subject', rows[0].id, `Deactivated NIOS subject: ${rows[0].name}`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_subjects SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_subject', 'nios_subject', rows[0].id, `Activated NIOS subject: ${rows[0].name}`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
