import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

// Chapters now root on the SUBJECT (shared across every stream-year the subject
// is placed in). The API still accepts a placement id (academic_year_subject_id)
// for backward compatibility and resolves it to the subject.
async function subjectForPlacement(academicYearSubjectId) {
  const rows = await sql`SELECT subject_id FROM academic_year_subjects WHERE id = ${academicYearSubjectId}`;
  return rows[0]?.subject_id ?? null;
}

// Resolve the requested subject from either subject_id or a placement id.
async function resolveSubjectId({ subject_id, academic_year_subject_id }) {
  if (subject_id) return Number(subject_id);
  if (academic_year_subject_id) return subjectForPlacement(academic_year_subject_id);
  return null;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { academic_year_subject_id, subject_id, include_inactive } = req.query;
    const resolvedSubject = await resolveSubjectId({ subject_id, academic_year_subject_id });
    if (!resolvedSubject) return res.status(400).json({ error: 'subject_id or academic_year_subject_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT c.*, u.name AS created_by_name
          FROM chapters c
          LEFT JOIN users u ON u.id = c.created_by
          WHERE c.subject_id = ${resolvedSubject}
          ORDER BY c.chapter_order, c.title`
      : await sql`
          SELECT c.*, u.name AS created_by_name
          FROM chapters c
          LEFT JOIN users u ON u.id = c.created_by
          WHERE c.subject_id = ${resolvedSubject} AND c.is_active = true
          ORDER BY c.chapter_order, c.title`;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM chapters WHERE id = ${req.params.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// A subject can be common (linked to several streams), so the "place" is just the
// subject name; enumerating every stream would bloat the activity log.
async function subjectName(subjectId) {
  const rows = await sql`SELECT name FROM subjects WHERE id = ${subjectId}`;
  return rows[0]?.name ?? null;
}

function chapterDetail(title, name) {
  return name ? `chapter: ${title} — ${name}` : `chapter: ${title}`;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { academic_year_subject_id, subject_id, title, description, chapter_order } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const resolvedSubject = await resolveSubjectId({ subject_id, academic_year_subject_id });
    if (!resolvedSubject) return res.status(400).json({ error: 'subject_id or academic_year_subject_id is required.' });
    const rows = await sql`
      INSERT INTO chapters (subject_id, title, description, chapter_order, created_by)
      VALUES (${resolvedSubject}, ${title}, ${description || null}, ${chapter_order || 1}, ${req.user.id})
      RETURNING *
    `;
    const name = await subjectName(resolvedSubject);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_chapter', 'chapter', rows[0].id, `Created ${chapterDetail(title, name)}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { title, description, chapter_order } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const rows = await sql`
      UPDATE chapters SET title = ${title}, description = ${description || null},
        chapter_order = ${chapter_order || 1}, updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const name = await subjectName(rows[0].subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_chapter', 'chapter', rows[0].id, `Updated ${chapterDetail(title, name)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE chapters SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const name = await subjectName(rows[0].subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_chapter', 'chapter', rows[0].id, `Deactivated ${chapterDetail(rows[0].title, name)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE chapters SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const name = await subjectName(rows[0].subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_chapter', 'chapter', rows[0].id, `Activated ${chapterDetail(rows[0].title, name)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
