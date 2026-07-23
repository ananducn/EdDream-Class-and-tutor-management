import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { academic_year_subject_id, include_inactive } = req.query;
    if (!academic_year_subject_id) return res.status(400).json({ error: 'academic_year_subject_id is required.' });
    const rows = include_inactive === 'true'
      ? await sql`
          SELECT c.*, u.name AS created_by_name
          FROM chapters c
          LEFT JOIN users u ON u.id = c.created_by
          WHERE c.academic_year_subject_id = ${academic_year_subject_id}
          ORDER BY c.chapter_order, c.title`
      : await sql`
          SELECT c.*, u.name AS created_by_name
          FROM chapters c
          LEFT JOIN users u ON u.id = c.created_by
          WHERE c.academic_year_subject_id = ${academic_year_subject_id} AND c.is_active = true
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

async function chapterPlace(academicYearSubjectId) {
  const rows = await sql`
    SELECT s.name AS subject_name, ay.name AS academic_year_name, st.name AS stream_name
    FROM academic_year_subjects ays
    JOIN subjects s ON s.id = ays.subject_id
    JOIN academic_years ay ON ay.id = ays.academic_year_id
    JOIN streams st ON st.id = ay.stream_id
    WHERE ays.id = ${academicYearSubjectId}
  `;
  return rows[0];
}

function chapterDetail(title, place) {
  if (!place) return `chapter: ${title}`;
  return `chapter: ${title} — ${place.subject_name} (${place.stream_name}, ${place.academic_year_name})`;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { academic_year_subject_id, title, description, chapter_order } = req.body;
    if (!academic_year_subject_id || !title) return res.status(400).json({ error: 'academic_year_subject_id and title are required.' });
    const rows = await sql`
      INSERT INTO chapters (academic_year_subject_id, title, description, chapter_order, created_by)
      VALUES (${academic_year_subject_id}, ${title}, ${description || null}, ${chapter_order || 1}, ${req.user.id})
      RETURNING *
    `;
    const place = await chapterPlace(academic_year_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_chapter', 'chapter', rows[0].id, `Created ${chapterDetail(title, place)}`);
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
    const place = await chapterPlace(rows[0].academic_year_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_chapter', 'chapter', rows[0].id, `Updated ${chapterDetail(title, place)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE chapters SET is_active = false, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await chapterPlace(rows[0].academic_year_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_chapter', 'chapter', rows[0].id, `Deactivated ${chapterDetail(rows[0].title, place)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/activate', auth, async (req, res, next) => {
  try {
    const rows = await sql`UPDATE chapters SET is_active = true, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const place = await chapterPlace(rows[0].academic_year_subject_id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'activate_chapter', 'chapter', rows[0].id, `Activated ${chapterDetail(rows[0].title, place)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
