import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// NIOS chapters now root on the SUBJECT (shared across every university the
// subject is placed in). The API still accepts a placement id
// (nios_university_subject_id) for backward compatibility and resolves it to the
// subject.
async function subjectForPlacement(niosUniversitySubjectId) {
  const rows = await sql`SELECT nios_subject_id FROM nios_university_subjects WHERE id = ${niosUniversitySubjectId}`;
  return rows[0]?.nios_subject_id ?? null;
}

async function resolveSubjectId({ nios_subject_id, nios_university_subject_id }) {
  if (nios_subject_id) return Number(nios_subject_id);
  if (nios_university_subject_id) return subjectForPlacement(nios_university_subject_id);
  return null;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_subject_id, nios_subject_id, include_inactive } = req.query;
    const subjectId = await resolveSubjectId({ nios_subject_id, nios_university_subject_id });
    if (!subjectId) return res.status(400).json({ error: 'nios_subject_id or nios_university_subject_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT c.*, u.name AS created_by_name
          FROM nios_chapters c LEFT JOIN users u ON u.id = c.created_by
          WHERE c.nios_subject_id = ${subjectId}
          ORDER BY c.chapter_order, c.title`
      : await sql`
          SELECT c.*, u.name AS created_by_name
          FROM nios_chapters c LEFT JOIN users u ON u.id = c.created_by
          WHERE c.nios_subject_id = ${subjectId} AND c.is_active = true
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

// A subject can be common (linked to several universities), so the "place" is
// just the subject name.
async function subjectName(subjectId) {
  const rows = await sql`SELECT name FROM nios_subjects WHERE id = ${subjectId}`;
  return rows[0]?.name ?? null;
}

function niosChapterDetail(title, name) {
  return name ? `chapter: ${title} — ${name}` : `chapter: ${title}`;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { nios_university_subject_id, nios_subject_id, title, description, chapter_order } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const subjectId = await resolveSubjectId({ nios_subject_id, nios_university_subject_id });
    if (!subjectId) return res.status(400).json({ error: 'nios_subject_id or nios_university_subject_id is required.' });
    const rows = await sql`
      INSERT INTO nios_chapters (nios_subject_id, title, description, chapter_order, created_by)
      VALUES (${subjectId}, ${title}, ${description || null}, ${chapter_order || 1}, ${req.user.id})
      RETURNING *
    `;
    const name = await subjectName(subjectId);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_chapter', 'nios_chapter', rows[0].id, `Created ${niosChapterDetail(title, name)}`);
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
    const name = await subjectName(rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_chapter', 'nios_chapter', rows[0].id, `Updated ${niosChapterDetail(title, name)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_chapters SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const name = await subjectName(rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_nios_chapter', 'nios_chapter', rows[0].id, `Deactivated ${niosChapterDetail(rows[0].title, name)}`);
    res.json({ message: 'Deactivated.' });
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE nios_chapters SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const name = await subjectName(rows[0].nios_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_nios_chapter', 'nios_chapter', rows[0].id, `Activated ${niosChapterDetail(rows[0].title, name)}`);
    res.json({ message: 'Activated.' });
  } catch (err) { next(err); }
});

export default router;
