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

    const rows = await sql`
      SELECT
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COUNT(c.id)::int AS total_classes,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours,
        COUNT(CASE WHEN c.is_recorded = true THEN 1 END)::int AS recorded_classes,
        COUNT(CASE WHEN c.payment_status = 'paid' THEN 1 END)::int AS paid_count,
        COUNT(CASE WHEN c.payment_status = 'pending' THEN 1 END)::int AS pending_count
      FROM class_entries c
      LEFT JOIN faculty f ON f.id = c.faculty_id
      WHERE c.date BETWEEN ${date_from} AND ${date_to}
      GROUP BY f.id, f.name
      ORDER BY total_hours DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error('reports/faculty error:', err);
    next(err);
  }
});

router.get('/recordings', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    const rows = await sql`
      SELECT
        COUNT(CASE WHEN is_recorded = true THEN 1 END)::int AS total_recorded,
        COUNT(CASE WHEN is_recorded = false THEN 1 END)::int AS total_not_recorded,
        COUNT(CASE WHEN editing_status = 'edited' THEN 1 END)::int AS total_edited,
        COUNT(CASE WHEN is_recorded = true AND editing_status = 'not_edited' THEN 1 END)::int AS total_not_edited
      FROM class_entries
      WHERE date BETWEEN ${date_from} AND ${date_to}
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error('reports/recordings error:', err);
    next(err);
  }
});

router.get('/uploads', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    const rows = await sql`
      SELECT
        c.id, c.date,
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COALESCE(sub.name, '—') AS subject_name,
        c.upload_student_app, c.upload_youtube, c.upload_gdrive, c.upload_harddisk
      FROM class_entries c
      LEFT JOIN faculty f ON f.id = c.faculty_id
      LEFT JOIN subjects sub ON sub.id = c.subject_id
      WHERE c.date BETWEEN ${date_from} AND ${date_to}
        AND c.is_recorded = true AND c.editing_status = 'edited'
      ORDER BY c.date DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error('reports/uploads error:', err);
    next(err);
  }
});

router.get('/payment', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    const rows = await sql`
      SELECT
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS payable_hours,
        COUNT(CASE WHEN c.payment_status = 'paid' THEN 1 END)::int AS paid_count,
        COUNT(CASE WHEN c.payment_status = 'pending' THEN 1 END)::int AS pending_count
      FROM class_entries c
      LEFT JOIN faculty f ON f.id = c.faculty_id
      WHERE c.date BETWEEN ${date_from} AND ${date_to}
      GROUP BY f.id, f.name
      ORDER BY f.name
    `;
    res.json(rows);
  } catch (err) {
    console.error('reports/payment error:', err);
    next(err);
  }
});

router.get('/university', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;

    const rows = await sql`
      SELECT
        COALESCE(u.name, 'Unassigned') AS university_name,
        COALESCE(sub.name, 'Unassigned') AS subject_name,
        COUNT(c.id)::int AS total_classes,
        COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours
      FROM class_entries c
      LEFT JOIN universities u ON u.id = c.university_id
      LEFT JOIN subjects sub ON sub.id = c.subject_id
      WHERE c.date BETWEEN ${date_from} AND ${date_to}
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

router.get('/export', auth, async (req, res, next) => {
  try {
    const { type, date_from, date_to } = req.query;
    if (!type || !date_from || !date_to) {
      return res.status(400).json({ error: 'type, date_from and date_to are required.' });
    }

    let rows = [];

    if (type === 'faculty') {
      rows = await sql`
        SELECT
          COALESCE(f.name, 'Unassigned') AS faculty_name,
          COUNT(c.id)::int AS total_classes,
          COALESCE(SUM(c.total_hours), 0)::numeric(10,2) AS total_hours,
          COUNT(CASE WHEN c.is_recorded = true THEN 1 END)::int AS recorded_classes,
          COUNT(CASE WHEN c.payment_status = 'paid' THEN 1 END)::int AS paid_count,
          COUNT(CASE WHEN c.payment_status = 'pending' THEN 1 END)::int AS pending_count
        FROM class_entries c LEFT JOIN faculty f ON f.id = c.faculty_id
        WHERE c.date BETWEEN ${date_from} AND ${date_to}
        GROUP BY f.id, f.name ORDER BY total_hours DESC
      `;
    } else if (type === 'recordings') {
      const r = await sql`
        SELECT
          COUNT(CASE WHEN is_recorded = true THEN 1 END)::int AS total_recorded,
          COUNT(CASE WHEN is_recorded = false THEN 1 END)::int AS total_not_recorded,
          COUNT(CASE WHEN editing_status = 'edited' THEN 1 END)::int AS total_edited,
          COUNT(CASE WHEN is_recorded = true AND editing_status = 'not_edited' THEN 1 END)::int AS total_not_edited
        FROM class_entries WHERE date BETWEEN ${date_from} AND ${date_to}
      `;
      rows = r;
    } else if (type === 'uploads') {
      rows = await sql`
        SELECT c.date, COALESCE(f.name,'Unassigned') AS faculty_name,
          COALESCE(sub.name,'—') AS subject_name,
          c.upload_student_app, c.upload_youtube, c.upload_gdrive, c.upload_harddisk
        FROM class_entries c
        LEFT JOIN faculty f ON f.id = c.faculty_id
        LEFT JOIN subjects sub ON sub.id = c.subject_id
        WHERE c.date BETWEEN ${date_from} AND ${date_to}
          AND c.is_recorded = true AND c.editing_status = 'edited'
        ORDER BY c.date DESC
      `;
    } else if (type === 'payment') {
      rows = await sql`
        SELECT COALESCE(f.name,'Unassigned') AS faculty_name,
          COALESCE(SUM(c.total_hours),0)::numeric(10,2) AS total_hours,
          COALESCE(SUM(c.total_hours),0)::numeric(10,2) AS payable_hours,
          COUNT(CASE WHEN c.payment_status='paid' THEN 1 END)::int AS paid_count,
          COUNT(CASE WHEN c.payment_status='pending' THEN 1 END)::int AS pending_count
        FROM class_entries c LEFT JOIN faculty f ON f.id = c.faculty_id
        WHERE c.date BETWEEN ${date_from} AND ${date_to}
        GROUP BY f.id, f.name ORDER BY f.name
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
    } else {
      return res.status(400).json({ error: 'Invalid report type.' });
    }

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('reports/export error:', err);
    next(err);
  }
});

export default router;
