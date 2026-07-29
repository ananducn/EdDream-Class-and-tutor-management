import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

function requireDates(req, res) {
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) {
    res.status(400).json({ error: 'date_from and date_to are required.' });
    return null;
  }
  return { date_from, date_to };
}

router.get('/faculty', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    // Collapse common-subject classes (one session, one row per batch) to a single
    // row so a class shared by N batches counts as one class / its hours once.
    const rows = await sql`
      SELECT
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COUNT(*)::int AS total_classes,
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(class_group_id, id)) id, faculty_id, total_hours
        FROM class_entries
        WHERE date BETWEEN ${date_from} AND ${date_to}
        ORDER BY COALESCE(class_group_id, id), id
      ) g
      LEFT JOIN faculty f ON f.id = g.faculty_id
      GROUP BY f.id, f.name
      ORDER BY total_hours DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error('reports/faculty error:', err);
    next(err);
  }
});

// Recording is now tracked per chapter (shared across batches), so this is a
// snapshot of the whole syllabus rather than a date-ranged count of sessions.
router.get('/recordings', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE r.is_recorded = true)::int AS total_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS total_not_recorded
      FROM chapters ch
      LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
      WHERE ch.is_active = true
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error('reports/recordings error:', err);
    next(err);
  }
});

// Recorded chapters and where each one lives. Chapter-level, not date-ranged.
router.get('/uploads', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        r.id, r.recording_date AS date,
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COALESCE(sub.name, '—') AS subject_name,
        ch.title AS chapter_title,
        r.upload_student_app, r.upload_youtube, r.upload_gdrive, r.upload_harddisk
      FROM chapter_recordings r
      JOIN chapters ch ON ch.id = r.chapter_id
      LEFT JOIN subjects sub ON sub.id = ch.subject_id
      LEFT JOIN faculty f ON f.id = r.faculty_id
      WHERE r.is_recorded = true
      ORDER BY sub.name, ch.chapter_order
    `;
    res.json(rows);
  } catch (err) {
    console.error('reports/uploads error:', err);
    next(err);
  }
});

router.get('/university', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    // Collapse common-subject classes the same way /faculty does. A common class
    // is one session stored as one row per batch, and every batch of a group
    // shares the university and subject this report groups by — so counting rows
    // would report it once per batch and add its hours that many times.
    const rows = await sql`
      SELECT
        COALESCE(u.name, 'Unassigned') AS university_name,
        COALESCE(sub.name, 'Unassigned') AS subject_name,
        COUNT(*)::int AS total_classes,
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(class_group_id, id)) id, university_id, subject_id, total_hours
        FROM class_entries
        WHERE date BETWEEN ${date_from} AND ${date_to}
        ORDER BY COALESCE(class_group_id, id), id
      ) g
      LEFT JOIN universities u ON u.id = g.university_id
      LEFT JOIN subjects sub ON sub.id = g.subject_id
      GROUP BY u.id, u.name, sub.id, sub.name
      ORDER BY u.name, sub.name
    `;

    // Group flat rows into nested structure
    const grouped = {};
    for (const row of rows) {
      const uName = row.university_name;
      if (!grouped[uName]) {
        grouped[uName] = { university_name: uName, total_classes: 0, total_hours: 0, subjects: [] };
      }
      grouped[uName].total_classes += Number(row.total_classes);
      grouped[uName].total_hours = (Number(grouped[uName].total_hours) + Number(row.total_hours)).toFixed(2);
      grouped[uName].subjects.push({
        subject_name: row.subject_name,
        total_classes: Number(row.total_classes),
        total_hours: Number(row.total_hours),
      });
    }
    res.json(Object.values(grouped));
  } catch (err) {
    console.error('reports/university error:', err);
    next(err);
  }
});

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const val = row[h] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(','));
  }
  return lines.join('\n');
}

function buildClassExportFilters(query) {
  const {
    date_from, date_to, faculty_id, subject_id, university_id, stream_id, batch_id,
    academic_year_id, semester_id, class_mode, class_status,
  } = query;
  const conditions = [];
  const params = [];
  let i = 1;
  if (date_from)        { conditions.push(`c.date >= $${i++}`);           params.push(date_from); }
  if (date_to)          { conditions.push(`c.date <= $${i++}`);           params.push(date_to); }
  if (faculty_id)       { conditions.push(`c.faculty_id = $${i++}`);      params.push(faculty_id); }
  if (subject_id)       { conditions.push(`c.subject_id = $${i++}`);      params.push(subject_id); }
  if (university_id)    { conditions.push(`c.university_id = $${i++}`);   params.push(university_id); }
  if (stream_id)        { conditions.push(`c.stream_id = $${i++}`);       params.push(stream_id); }
  if (batch_id)         { conditions.push(`c.batch_id = $${i++}`);        params.push(batch_id); }
  if (academic_year_id) {
    conditions.push(`c.subject_id IN (SELECT ays.subject_id FROM academic_year_subjects ays WHERE ays.academic_year_id = $${i++})`);
    params.push(academic_year_id);
  }
  if (semester_id) {
    conditions.push(`c.subject_id IN (SELECT ays.subject_id FROM academic_year_subjects ays WHERE ays.semester_id = $${i++})`);
    params.push(semester_id);
  }
  if (class_mode)     { conditions.push(`c.class_mode = $${i++}`);        params.push(class_mode); }
  if (class_status)   { conditions.push(`c.class_status = $${i++}`);      params.push(class_status); }
  return { conditions, params };
}

router.get('/export', auth, async (req, res, next) => {
  try {
    const { type, date_from, date_to } = req.query;
    if (!type) {
      return res.status(400).json({ error: 'type is required.' });
    }
    if (type !== 'class_overview' && (!date_from || !date_to)) {
      return res.status(400).json({ error: 'date_from and date_to are required.' });
    }

    let rows = [];

    if (type === 'faculty') {
      // Count a common-subject class (one session, many batch rows) once.
      rows = await sql`
        SELECT
          COALESCE(f.name, 'Unassigned') AS faculty_name,
          COUNT(*)::int AS total_classes,
          COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
        FROM (
          SELECT DISTINCT ON (COALESCE(class_group_id, id)) id, faculty_id, total_hours
          FROM class_entries
          WHERE date BETWEEN ${date_from} AND ${date_to}
          ORDER BY COALESCE(class_group_id, id), id
        ) g
        LEFT JOIN faculty f ON f.id = g.faculty_id
        GROUP BY f.id, f.name ORDER BY total_hours DESC
      `;
    } else if (type === 'recordings') {
      rows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE r.is_recorded = true)::int AS total_recorded,
          COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS total_not_recorded
        FROM chapters ch
        LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
        WHERE ch.is_active = true
      `;
    } else if (type === 'uploads') {
      rows = await sql`
        SELECT ch.title AS chapter_title, COALESCE(sub.name,'—') AS subject_name,
          COALESCE(f.name,'Unassigned') AS faculty_name, r.recording_date,
          r.upload_student_app, r.upload_youtube, r.upload_gdrive, r.upload_harddisk
        FROM chapter_recordings r
        JOIN chapters ch ON ch.id = r.chapter_id
        LEFT JOIN subjects sub ON sub.id = ch.subject_id
        LEFT JOIN faculty f ON f.id = r.faculty_id
        WHERE r.is_recorded = true
        ORDER BY sub.name, ch.chapter_order
      `;
    } else if (type === 'university') {
      rows = await sql`
        SELECT COALESCE(u.name,'Unassigned') AS university_name,
          COALESCE(sub.name,'Unassigned') AS subject_name,
          COUNT(c.id)::int AS total_classes,
          COALESCE(SUM(c.total_hours),0)::numeric(10,2) AS total_hours
        FROM class_entries c
        LEFT JOIN universities u ON u.id = c.university_id
        LEFT JOIN subjects sub ON sub.id = c.subject_id
        WHERE c.date BETWEEN ${date_from} AND ${date_to}
        GROUP BY u.id, u.name, sub.id, sub.name
        ORDER BY u.name, sub.name
      `;
    } else if (type === 'class_overview') {
      const { conditions, params } = buildClassExportFilters(req.query);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      rows = await sql.query(
        `SELECT
          to_char(c.date, 'YYYY-MM-DD') AS date,
          COALESCE(f.name, 'Unassigned') AS faculty,
          COALESCE(sub.name, '—') AS subject,
          COALESCE(u.name, '—') AS university,
          COALESCE(b.name, '—') AS batch,
          COALESCE(st.name, '—') AS stream,
          c.total_hours,
          c.class_mode,
          c.class_status,
          c.notes
        FROM class_entries c
        LEFT JOIN faculty f ON f.id = c.faculty_id
        LEFT JOIN subjects sub ON sub.id = c.subject_id
        LEFT JOIN universities u ON u.id = c.university_id
        LEFT JOIN batches b ON b.id = c.batch_id
        LEFT JOIN streams st ON st.id = c.stream_id
        ${where}
        ORDER BY c.date DESC, c.start_time DESC`,
        params
      );
    } else {
      return res.status(400).json({ error: 'Invalid report type.' });
    }

    const csv = toCSV(rows);
    const filename = type === 'class_overview' ? 'class_overview.csv' : `${type}_report.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('reports/export error:', err);
    next(err);
  }
});

export default router;
