import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, nios_stream_id, year, include_inactive } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (include_inactive !== 'true') conditions.push('b.is_active = true');
    if (nios_university_id) { conditions.push(`b.nios_university_id = $${i++}`); params.push(nios_university_id); }
    if (nios_stream_id) { conditions.push(`b.nios_stream_id = $${i++}`); params.push(nios_stream_id); }
    if (year) { conditions.push(`b.year = $${i++}`); params.push(year); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT b.*, u.name AS university_name, st.name AS stream_name
       FROM nios_batches b
       LEFT JOIN nios_universities u ON u.id = b.nios_university_id
       LEFT JOIN nios_streams st ON st.id = b.nios_stream_id
       ${where} ORDER BY b.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT b.*, u.name AS university_name, st.name AS stream_name
      FROM nios_batches b
      LEFT JOIN nios_universities u ON u.id = b.nios_university_id
      LEFT JOIN nios_streams st ON st.id = b.nios_stream_id
      WHERE b.id = ${req.params.id}
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function universityName(id) {
  const rows = await sql`SELECT name FROM nios_universities WHERE id = ${id}`;
  return rows[0]?.name ?? null;
}

// Staff and admins can create; editing and deactivating stay admin-only.
// The stream fixes the university, so the batch's syllabus is unambiguous.
router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_stream_id, name, year } = req.body;
    if (!name || !nios_stream_id) return res.status(400).json({ error: 'Name and stream are required.' });
    const stream = await sql`SELECT nios_university_id FROM nios_streams WHERE id = ${nios_stream_id}`;
    if (!stream[0]) return res.status(400).json({ error: 'Stream not found.' });
    const nios_university_id = stream[0].nios_university_id;
    const rows = await sql`
      INSERT INTO nios_batches (nios_university_id, nios_stream_id, name, year, created_by)
      VALUES (${nios_university_id}, ${nios_stream_id}, ${name}, ${year || null}, ${req.user.id})
      RETURNING *
    `;
    const uniName = await universityName(nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_batch', 'nios_batch', rows[0].id,
      `Created NIOS batch: ${name} (${uniName || 'University N/A'})${year ? `, Year ${year}` : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const { name, year, nios_stream_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    // Moving a batch to another stream also moves it to that stream's university.
    let universityId = null;
    if (nios_stream_id) {
      const stream = await sql`SELECT nios_university_id FROM nios_streams WHERE id = ${nios_stream_id}`;
      if (!stream[0]) return res.status(400).json({ error: 'Stream not found.' });
      universityId = stream[0].nios_university_id;
    }
    const rows = await sql`
      UPDATE nios_batches SET name = ${name}, year = ${year || null},
        nios_stream_id = COALESCE(${nios_stream_id || null}, nios_stream_id),
        nios_university_id = COALESCE(${universityId}, nios_university_id)
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_batch', 'nios_batch', rows[0].id,
      `Updated NIOS batch: ${name} (${uniName || 'University N/A'})${rows[0].year ? `, Year ${rows[0].year}` : ''}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_batches SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_batch', 'nios_batch', rows[0].id,
      `Deactivated NIOS batch: ${rows[0].name} (${uniName || 'University N/A'})`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`UPDATE nios_batches SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const uniName = await universityName(rows[0].nios_university_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_batch', 'nios_batch', rows[0].id,
      `Activated NIOS batch: ${rows[0].name} (${uniName || 'University N/A'})`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
