import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

const RESOURCE_TYPES = ['notes', 'pdf', 'video', 'assignment', 'quiz', 'question_paper'];

router.get('/', auth, async (req, res, next) => {
  try {
    const { chapter_id, include_inactive } = req.query;
    if (!chapter_id) return res.status(400).json({ error: 'chapter_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`SELECT lr.*, u.name AS created_by_name FROM learning_resources lr LEFT JOIN users u ON u.id = lr.created_by WHERE lr.chapter_id = ${chapter_id} ORDER BY lr.type, lr.title`
      : await sql`SELECT lr.*, u.name AS created_by_name FROM learning_resources lr LEFT JOIN users u ON u.id = lr.created_by WHERE lr.chapter_id = ${chapter_id} AND lr.is_active = true ORDER BY lr.type, lr.title`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM learning_resources WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

async function resourcePlace(chapterId) {
  const rows = await sql`
    SELECT ch.title AS chapter_title, s.name AS subject_name
    FROM chapters ch
    JOIN academic_year_subjects ays ON ays.id = ch.academic_year_subject_id
    JOIN subjects s ON s.id = ays.subject_id
    WHERE ch.id = ${chapterId}
  `;
  return rows[0];
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { chapter_id, type, title, url, description } = req.body;
    if (!chapter_id || !type || !title) return res.status(400).json({ error: 'chapter_id, type, and title are required.' });
    if (!RESOURCE_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${RESOURCE_TYPES.join(', ')}.` });
    const rows = await sql`
      INSERT INTO learning_resources (chapter_id, type, title, url, description, created_by)
      VALUES (${chapter_id}, ${type}, ${title}, ${url || null}, ${description || null}, ${req.user.id})
      RETURNING *
    `;
    const place = await resourcePlace(chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_resource', 'learning_resource', rows[0].id,
      `Created resource: ${title} (${type}) — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { type, title, url, description } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title are required.' });
    if (!RESOURCE_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${RESOURCE_TYPES.join(', ')}.` });
    const rows = await sql`
      UPDATE learning_resources SET type = ${type}, title = ${title}, url = ${url || null},
        description = ${description || null}, updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await resourcePlace(rows[0].chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_resource', 'learning_resource', rows[0].id,
      `Updated resource: ${title} (${type}) — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE learning_resources SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await resourcePlace(rows[0].chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_resource', 'learning_resource', rows[0].id,
      `Deactivated resource: ${rows[0].title} — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE learning_resources SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await resourcePlace(rows[0].chapter_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_resource', 'learning_resource', rows[0].id,
      `Activated resource: ${rows[0].title} — ${place?.chapter_title || 'N/A'} / ${place?.subject_name || 'N/A'}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
