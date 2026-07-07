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

async function copyBatchStructure(sourceBatchId, newBatchId, userId) {
  const sourceYears = await sql`
    SELECT * FROM academic_years WHERE batch_id = ${sourceBatchId} AND is_active = true ORDER BY year_order
  `;
  for (const srcYear of sourceYears) {
    const [newYear] = await sql`
      INSERT INTO academic_years (batch_id, name, year_order)
      VALUES (${newBatchId}, ${srcYear.name}, ${srcYear.year_order})
      RETURNING *
    `;
    const srcSemesters = await sql`
      SELECT * FROM semesters WHERE academic_year_id = ${srcYear.id} AND is_active = true ORDER BY semester_order
    `;
    const semMap = {};
    for (const s of srcSemesters) {
      const [ns] = await sql`
        INSERT INTO semesters (academic_year_id, name, semester_order)
        VALUES (${newYear.id}, ${s.name}, ${s.semester_order})
        RETURNING *
      `;
      semMap[s.id] = ns.id;
    }
    const srcAYS = await sql`
      SELECT * FROM academic_year_subjects WHERE academic_year_id = ${srcYear.id}
    `;
    for (const ays of srcAYS) {
      const newSemId = ays.semester_id ? (semMap[ays.semester_id] ?? null) : null;
      const [newAYS] = await sql`
        INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id)
        VALUES (${newYear.id}, ${ays.subject_id}, ${newSemId})
        ON CONFLICT (academic_year_id, subject_id) DO NOTHING
        RETURNING *
      `;
      if (!newAYS) continue;
      const srcChapters = await sql`
        SELECT * FROM chapters WHERE academic_year_subject_id = ${ays.id} AND is_active = true ORDER BY chapter_order
      `;
      for (const ch of srcChapters) {
        const [newCh] = await sql`
          INSERT INTO chapters (academic_year_subject_id, title, description, chapter_order, created_by)
          VALUES (${newAYS.id}, ${ch.title}, ${ch.description ?? null}, ${ch.chapter_order}, ${userId})
          RETURNING *
        `;
        const srcRes = await sql`
          SELECT * FROM learning_resources WHERE chapter_id = ${ch.id} AND is_active = true ORDER BY type, title
        `;
        for (const r of srcRes) {
          await sql`
            INSERT INTO learning_resources (chapter_id, type, title, url, description, created_by)
            VALUES (${newCh.id}, ${r.type}, ${r.title}, ${r.url ?? null}, ${r.description ?? null}, ${userId})
          `;
        }
      }
    }
  }
}

async function placeNames(universityId, streamId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM universities WHERE id = ${universityId}) AS university_name,
      (SELECT name FROM streams WHERE id = ${streamId}) AS stream_name
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, university_id, stream_id, copy_from_batch_id } = req.body;
    if (!name || !university_id || !stream_id) return res.status(400).json({ error: 'Name, university, and stream are required.' });
    const rows = await sql`
      INSERT INTO batches (name, university_id, stream_id)
      VALUES (${name}, ${university_id}, ${stream_id})
      RETURNING *
    `;
    const newBatch = rows[0];
    if (copy_from_batch_id) {
      await copyBatchStructure(copy_from_batch_id, newBatch.id, req.user.id);
    }
    const place = await placeNames(university_id, stream_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_batch', 'batch', newBatch.id,
      `Created batch: ${name} (${place.university_name || 'University N/A'} / ${place.stream_name || 'Stream N/A'})${copy_from_batch_id ? ` — copied structure from batch #${copy_from_batch_id}` : ''}`);
    res.status(201).json({ ...newBatch, copied: !!copy_from_batch_id });
  } catch (err) { next(err); }
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
  const place = await placeNames(university_id, stream_id);
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_batch', 'batch', rows[0].id,
    `Updated batch: ${name} (${place.university_name || 'University N/A'} / ${place.stream_name || 'Stream N/A'})`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE batches SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  const place = await placeNames(rows[0].university_id, rows[0].stream_id);
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_batch', 'batch', rows[0].id,
    `Deactivated batch: ${rows[0].name} (${place.university_name || 'University N/A'} / ${place.stream_name || 'Stream N/A'})`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE batches SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  const place = await placeNames(rows[0].university_id, rows[0].stream_id);
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_batch', 'batch', rows[0].id,
    `Activated batch: ${rows[0].name} (${place.university_name || 'University N/A'} / ${place.stream_name || 'Stream N/A'})`);
  res.json({ message: 'Activated.' });
});

export default router;
