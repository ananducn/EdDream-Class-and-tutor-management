import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const VALID_TYPES = ['notes', 'pdf', 'video', 'assignment', 'quiz', 'question_paper'];

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_chapter_id, include_inactive } = req.query;
    if (!nios_chapter_id) return res.status(400).json({ error: 'nios_chapter_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT r.*, u.name AS created_by_name
          FROM nios_resources r LEFT JOIN users u ON u.id = r.created_by
          WHERE r.nios_chapter_id = ${nios_chapter_id}
          ORDER BY r.type, r.title`
      : await sql`
          SELECT r.*, u.name AS created_by_name
          FROM nios_resources r LEFT JOIN users u ON u.id = r.created_by
          WHERE r.nios_chapter_id = ${nios_chapter_id} AND r.is_active = true
          ORDER BY r.type, r.title`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM nios_resources WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function niosResourcePlace(niosChapterId) {
  const rows = await sql`
    SELECT ch.title AS chapter_title, s.name AS subject_name
    FROM nios_chapters ch
    JOIN nios_batch_subjects bs ON bs.id = ch.nios_batch_subject_id
    JOIN nios_subjects s ON s.id = bs.nios_subject_id
    WHERE ch.id = ${niosChapterId}
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_chapter_id, type, title, url, description } = req.body;
    if (!nios_chapter_id || !type || !title) return res.status(400).json({ error: 'nios_chapter_id, type, and title are required.' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    const rows = await sql`
      INSERT INTO nios_resources (nios_chapter_id, type, title, url, description, created_by)
      VALUES (${nios_chapter_id}, ${type}, ${title}, ${url || null}, ${description || null}, ${req.user.id})
      RETURNING *
    `;
    const place = await niosResourcePlace(nios_chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_resource', 'nios_resource', rows[0].id,
      `Created resource: ${title} (${type}) — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { type, title, url, description } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title are required.' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    const rows = await sql`
      UPDATE nios_resources SET type = ${type}, title = ${title}, url = ${url || null},
        description = ${description || null}, updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosResourcePlace(rows[0].nios_chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_resource', 'nios_resource', rows[0].id,
      `Updated resource: ${title} (${type}) — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_resources SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosResourcePlace(rows[0].nios_chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_resource', 'nios_resource', rows[0].id,
      `Deactivated resource: ${rows[0].title} — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_resources SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await niosResourcePlace(rows[0].nios_chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_resource', 'nios_resource', rows[0].id,
      `Activated resource: ${rows[0].title} — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
