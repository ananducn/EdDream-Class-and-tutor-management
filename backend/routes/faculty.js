import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const router = express.Router();

async function getFacultyWithLinks(id) {
  const [faculty, subjects, universities, batches] = await Promise.all([
    sql`SELECT * FROM faculty WHERE id = ${id}`,
    sql`SELECT sub.id, sub.name FROM faculty_subjects fs JOIN subjects sub ON sub.id = fs.subject_id WHERE fs.faculty_id = ${id}`,
    sql`SELECT u.id, u.name FROM faculty_universities fu JOIN universities u ON u.id = fu.university_id WHERE fu.faculty_id = ${id}`,
    sql`SELECT b.id, b.name FROM faculty_batches fb JOIN batches b ON b.id = fb.batch_id WHERE fb.faculty_id = ${id}`,
  ]);
  if (!faculty[0]) return null;
  return { ...faculty[0], subjects, universities, batches };
}

router.get('/', auth, async (req, res) => {
  const facultyList = await sql`SELECT * FROM faculty ORDER BY name`;
  const results = await Promise.all(facultyList.map((f) => getFacultyWithLinks(f.id)));
  res.json(results.filter(Boolean));
});

router.get('/:id', auth, async (req, res) => {
  const faculty = await getFacultyWithLinks(req.params.id);
  if (!faculty) return res.status(404).json({ error: 'Not found.' });
  res.json(faculty);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, email, phone, payment_type, hourly_rate, subject_ids = [], university_ids = [], batch_ids = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const rows = await sql`
    INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
    VALUES (${name}, ${email || null}, ${phone || null}, ${payment_type || null}, ${hourly_rate || null})
    RETURNING *
  `;
  const facultyId = rows[0].id;

  try {
    if (subject_ids.length > 0) {
      for (const sid of subject_ids) {
        await sql`INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (${facultyId}, ${sid})`;
      }
    }
    if (university_ids.length > 0) {
      for (const uid of university_ids) {
        await sql`INSERT INTO faculty_universities (faculty_id, university_id) VALUES (${facultyId}, ${uid})`;
      }
    }
    if (batch_ids.length > 0) {
      for (const bid of batch_ids) {
        await sql`INSERT INTO faculty_batches (faculty_id, batch_id) VALUES (${facultyId}, ${bid})`;
      }
    }
  } catch (err) {
    await sql`DELETE FROM faculty WHERE id = ${facultyId}`;
    return res.status(500).json({ error: 'Failed to save links.' });
  }

  const result = await getFacultyWithLinks(facultyId);
  await logActivity(req.user.id, req.user.name, req.user.role, 'create_faculty', 'faculty', facultyId,
    `Created faculty: ${name}${result.subjects.length ? ` — subjects: ${result.subjects.map((s) => s.name).join(', ')}` : ''}${result.universities.length ? `; universities: ${result.universities.map((u) => u.name).join(', ')}` : ''}${result.batches.length ? `; batches: ${result.batches.map((b) => b.name).join(', ')}` : ''}`);
  res.status(201).json(result);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const { name, email, phone, payment_type, hourly_rate, subject_ids = [], university_ids = [], batch_ids = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const rows = await sql`
    UPDATE faculty SET name = ${name}, email = ${email || null}, phone = ${phone || null},
      payment_type = ${payment_type || null}, hourly_rate = ${hourly_rate || null}
    WHERE id = ${req.params.id} RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  const facultyId = rows[0].id;

  try {
    await sql`DELETE FROM faculty_subjects WHERE faculty_id = ${facultyId}`;
    await sql`DELETE FROM faculty_universities WHERE faculty_id = ${facultyId}`;
    await sql`DELETE FROM faculty_batches WHERE faculty_id = ${facultyId}`;

    for (const sid of subject_ids) {
      await sql`INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (${facultyId}, ${sid})`;
    }
    for (const uid of university_ids) {
      await sql`INSERT INTO faculty_universities (faculty_id, university_id) VALUES (${facultyId}, ${uid})`;
    }
    for (const bid of batch_ids) {
      await sql`INSERT INTO faculty_batches (faculty_id, batch_id) VALUES (${facultyId}, ${bid})`;
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save links.' });
  }

  const result = await getFacultyWithLinks(facultyId);
  await logActivity(req.user.id, req.user.name, req.user.role, 'update_faculty', 'faculty', facultyId,
    `Updated faculty: ${name}${result.subjects.length ? ` — subjects: ${result.subjects.map((s) => s.name).join(', ')}` : ''}${result.universities.length ? `; universities: ${result.universities.map((u) => u.name).join(', ')}` : ''}${result.batches.length ? `; batches: ${result.batches.map((b) => b.name).join(', ')}` : ''}`);
  res.json(result);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`UPDATE faculty SET is_active = false WHERE id = ${req.params.id} RETURNING *`;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'deactivate_faculty', 'faculty', rows[0].id, `Deactivated faculty: ${rows[0].name}`);
  res.json({ message: 'Deactivated.' });
});

router.patch('/:id/activate', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  const rows = await sql`UPDATE faculty SET is_active = true WHERE id = ${req.params.id} RETURNING *`;
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  await logActivity(req.user.id, req.user.name, req.user.role, 'activate_faculty', 'faculty', rows[0].id, `Activated faculty: ${rows[0].name}`);
  res.json({ message: 'Activated.' });
});

export default router;
