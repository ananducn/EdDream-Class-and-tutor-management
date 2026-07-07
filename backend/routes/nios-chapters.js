import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_batch_subject_id, include_inactive } = req.query;
    if (!nios_batch_subject_id) return res.status(400).json({ error: 'nios_batch_subject_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT c.*, u.name AS created_by_name
          FROM nios_chapters c LEFT JOIN users u ON u.id = c.created_by
          WHERE c.nios_batch_subject_id = ${nios_batch_subject_id}
          ORDER BY c.chapter_order, c.title`
      : await sql`
          SELECT c.*, u.name AS created_by_name
          FROM nios_chapters c LEFT JOIN users u ON u.id = c.created_by
          WHERE c.nios_batch_subject_id = ${nios_batch_subject_id} AND c.is_active = true
          ORDER BY c.chapter_order, c.title`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM nios_chapters WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function niosChapterPlace(niosBatchSubjectId) {
  const rows = await sql`
    SELECT s.name AS subject_name, b.name AS batch_name
    FROM nios_batch_subjects bs
    JOIN nios_subjects s ON s.id = bs.nios_subject_id
    JOIN nios_batches b ON b.id = bs.nios_batch_id
    WHERE bs.id = ${niosBatchSubjectId}
  `;
  return rows[0];
}

function niosChapterDetail(title, place) {
  if (!place) return `chapter: ${title}`;
  return `chapter: ${title} — ${place.subject_name} (${place.batch_name})`;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_batch_subject_id, title, description, chapter_order } = req.body;
    if (!nios_batch_subject_id || !title) return res.status(400).json({ error: 'nios_batch_subject_id and title are required.' });
    const rows = await sql`
      INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by)
      VALUES (${nios_batch_subject_id}, ${title}, ${description || null}, ${chapter_order || 1}, ${req.user.id})
      RETURNING *
    `;
    const place = await niosChapterPlace(nios_batch_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_chapter', 'nios_chapter', rows[0].id, `Created ${niosChapterDetail(title, place)}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { title, description, chapter_order } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const rows = await sql`
      UPDATE nios_chapters SET title = ${title}, description = ${description || null},
        chapter_order = ${chapter_order || 1}, updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosChapterPlace(rows[0].nios_batch_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_chapter', 'nios_chapter', rows[0].id, `Updated ${niosChapterDetail(title, place)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_chapters SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosChapterPlace(rows[0].nios_batch_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_chapter', 'nios_chapter', rows[0].id, `Deactivated ${niosChapterDetail(rows[0].title, place)}`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_chapters SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosChapterPlace(rows[0].nios_batch_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_chapter', 'nios_chapter', rows[0].id, `Activated ${niosChapterDetail(rows[0].title, place)}`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
