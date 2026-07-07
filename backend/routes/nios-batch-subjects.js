import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_batch_id } = req.query;
    if (!nios_batch_id) return res.status(400).json({ error: 'nios_batch_id is required.' });
    const rows = await sql`
      SELECT bs.*, s.name AS subject_name, s.subject_code, s.is_active AS subject_active
      FROM nios_batch_subjects bs
      JOIN nios_subjects s ON s.id = bs.nios_subject_id
      WHERE bs.nios_batch_id = ${nios_batch_id}
      ORDER BY s.name
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

async function batchSubjectNames(niosBatchId, niosSubjectId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM nios_subjects WHERE id = ${niosSubjectId}) AS subject_name,
      (SELECT name FROM nios_batches WHERE id = ${niosBatchId}) AS batch_name
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_batch_id, nios_subject_id } = req.body;
    if (!nios_batch_id || !nios_subject_id) return res.status(400).json({ error: 'nios_batch_id and nios_subject_id are required.' });
    const rows = await sql`
      INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id)
      VALUES (${nios_batch_id}, ${nios_subject_id})
      ON CONFLICT (nios_batch_id, nios_subject_id) DO NOTHING
      RETURNING *
    `;
    if (!rows[0]) return res.status(409).json({ error: 'Subject is already assigned to this batch.' });
    const names = await batchSubjectNames(nios_batch_id, nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'assign_nios_subject', 'nios_batch_subject', rows[0].id,
      `Assigned subject: ${names.subject_name} to NIOS batch ${names.batch_name}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`DELETE FROM nios_batch_subjects WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const names = await batchSubjectNames(rows[0].nios_batch_id, rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'remove_nios_subject', 'nios_batch_subject', rows[0].id,
      `Removed subject: ${names.subject_name} from NIOS batch ${names.batch_name}`);
    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

export default router;
