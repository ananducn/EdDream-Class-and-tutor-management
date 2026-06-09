import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { university_id, stream_id, batch_id, academic_year_id, semester_id, assigned, include_inactive } = req.query;
  const all = include_inactive === 'true';

  const conditions = [];
  const params = [];
  let i = 1;

  if (!all) conditions.push('sub.is_active = true');
  if (university_id) { conditions.push(`sub.university_id = $${i++}`); params.push(university_id); }
  if (stream_id)     { conditions.push(`sub.stream_id = $${i++}`);     params.push(stream_id); }

  // Joins for curriculum filters
  let aysJoin = '';
  let ayJoin = '';

  if (assigned === 'false') {
    aysJoin = 'LEFT JOIN academic_year_subjects ays ON ays.subject_id = sub.id';
    conditions.push('ays.id IS NULL');
  } else if (assigned === 'true' || batch_id || academic_year_id || semester_id) {
    aysJoin = 'INNER JOIN academic_year_subjects ays ON ays.subject_id = sub.id';
  }

  if (batch_id) {
    ayJoin = 'INNER JOIN academic_years ay ON ay.id = ays.academic_year_id';
    conditions.push(`ay.batch_id = $${i++}`);
    params.push(batch_id);
  }
  if (academic_year_id) { conditions.push(`ays.academic_year_id = $${i++}`); params.push(academic_year_id); }
  if (semester_id)      { conditions.push(`ays.semester_id = $${i++}`);      params.push(semester_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await sql.query(
    `SELECT DISTINCT sub.*, u.name AS university_name, s.name AS stream_name
     FROM subjects sub
     LEFT JOIN universities u ON u.id = sub.university_id
     LEFT JOIN streams s ON s.id = sub.stream_id
     ${aysJoin} ${ayJoin}
     ${where}
     ORDER BY sub.name`,
    params
  );
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, subject_code, university_id, stream_id, assignments } = req.body;
  if (!name || !university_id || !stream_id) return res.status(400).json({ error: 'Name, university, and stream are required.' });
  const valid = Array.isArray(assignments) && assignments.filter((a) => a.academic_year_id);
  if (!valid || valid.length === 0) return res.status(400).json({ error: 'At least one batch + academic year assignment is required.' });

  const rows = await sql`
    INSERT INTO subjects (name, subject_code, university_id, stream_id)
    VALUES (${name}, ${subject_code || null}, ${university_id}, ${stream_id})
    RETURNING *
  `;
  const subjectId = rows[0].id;
  for (const { academic_year_id, semester_id } of valid) {
    await sql`
      INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id)
      VALUES (${academic_year_id}, ${subjectId}, ${semester_id || null})
      ON CONFLICT (academic_year_id, subject_id) DO NOTHING
    `;
  }
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_subject', 'subject', subjectId, `Created subject: ${name}`);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, subject_code, university_id, stream_id, assignments } = req.body;
  if (!name || !university_id || !stream_id) return res.status(400).json({ error: 'Name, university, and stream are required.' });
  const valid = Array.isArray(assignments) && assignments.filter((a) => a.academic_year_id);
  if (!valid || valid.length === 0) return res.status(400).json({ error: 'At least one batch + academic year assignment is required.' });

  const rows = await sql`
    UPDATE subjects SET name = ${name}, subject_code = ${subject_code || null},
      university_id = ${university_id}, stream_id = ${stream_id}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });

  // Replace all assignments: delete existing, re-insert current
  await sql`DELETE FROM academic_year_subjects WHERE subject_id = ${req.params.id}`;
  for (const { academic_year_id, semester_id } of valid) {
    await sql`
      INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id)
      VALUES (${academic_year_id}, ${req.params.id}, ${semester_id || null})
      ON CONFLICT (academic_year_id, subject_id) DO NOTHING
    `;
  }
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_subject', 'subject', rows[0].id, `Updated subject: ${name}`);
  res.json(rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE subjects SET is_active = false WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_subject', 'subject', rows[0].id, `Deactivated subject: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`
    UPDATE subjects SET is_active = true WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_subject', 'subject', rows[0].id, `Activated subject: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
