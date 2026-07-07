import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { include_inactive } = req.query;
    const rows = include_inactive === 'true'
      ? await sql`SELECT * FROM nios_universities ORDER BY name`
      : await sql`SELECT * FROM nios_universities WHERE is_active = true ORDER BY name`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM nios_universities WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
