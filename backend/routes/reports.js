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
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours,
        COUNT(*) FILTER (WHERE g.class_mode = 'online')::int AS online_classes,
        COUNT(*) FILTER (WHERE g.class_mode = 'offline')::int AS offline_classes,
        COUNT(*) FILTER (WHERE g.class_status = 'taken')::int AS taken_classes,
        COUNT(*) FILTER (WHERE g.class_status = 'scheduled')::int AS scheduled_classes,
        COUNT(*) FILTER (WHERE g.class_status = 'not_taken')::int AS not_taken_classes,
        COALESCE(SUM(g.total_hours) FILTER (WHERE g.payment_status = 'paid'), 0)::numeric(10,2) AS paid_hours,
        COALESCE(SUM(g.total_hours) FILTER (WHERE g.payment_status <> 'paid'), 0)::numeric(10,2) AS pending_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(class_group_id, id))
          id, faculty_id, total_hours, class_mode, class_status, payment_status
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
    const uploaded = `(COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false)
                       OR COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false))`;

    const totals = await sql.query(`
      SELECT
        COUNT(*)::int AS total_chapters,
        COUNT(*) FILTER (WHERE r.is_recorded)::int AS total_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS total_not_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded AND NOT ${uploaded})::int AS pending_upload,
        COUNT(*) FILTER (WHERE r.editing_status = 'edited')::int AS edited,
        COUNT(*) FILTER (WHERE r.backup_available)::int AS backed_up,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_youtube,false))::int AS on_youtube,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_gdrive,false))::int AS on_gdrive,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_student_app,false))::int AS on_student_app,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_harddisk,false))::int AS on_harddisk
      FROM chapters ch
      LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
      WHERE ch.is_active = true`);

    // Breakdown goes through the placement table, where a subject shared by two
    // streams genuinely belongs to both — so these rows overlap by design and
    // will not sum to the totals above. The page labels that.
    const breakdown = await sql.query(`
      SELECT
        u.name AS university_name,
        st.name AS stream_name,
        sub.name AS subject_name,
        COUNT(*)::int AS chapters,
        COUNT(*) FILTER (WHERE r.is_recorded)::int AS recorded,
        COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS not_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded AND NOT ${uploaded})::int AS pending_upload
      FROM academic_year_subjects ays
      JOIN academic_years ay   ON ay.id = ays.academic_year_id
      JOIN streams st          ON st.id = ay.stream_id
      JOIN universities u      ON u.id = st.university_id
      JOIN subjects sub        ON sub.id = ays.subject_id
      JOIN chapters ch         ON ch.subject_id = ays.subject_id AND ch.is_active = true
      LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
      GROUP BY u.name, st.name, sub.name
      ORDER BY u.name, st.name, sub.name`);

    res.json({ ...totals[0], breakdown });
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
        ch.chapter_order,
        r.recording_duration, r.editing_status, r.backup_available, r.storage_location,
        r.upload_student_app, r.upload_student_app_link,
        r.upload_youtube, r.upload_youtube_link, r.youtube_privacy,
        r.upload_gdrive, r.upload_gdrive_link,
        r.upload_harddisk, r.upload_harddisk_location,
        COALESCE((
          SELECT string_agg(DISTINCT st.name, ', ')
          FROM academic_year_subjects ays
          JOIN academic_years ay ON ay.id = ays.academic_year_id
          JOIN streams st ON st.id = ay.stream_id
          WHERE ays.subject_id = ch.subject_id
        ), '—') AS streams
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
    // shares the university this report groups by — so counting rows would
    // report it once per batch and add its hours that many times.
    //
    // class_entries carries its own stream_id, so the stream level here is the
    // stream the class was actually taught to, not a placement lookup — no
    // overlap, and the rows do sum to the university total.
    const rows = await sql`
      SELECT
        COALESCE(u.name, 'Unassigned') AS university_name,
        COALESCE(st.name, 'Unassigned') AS stream_name,
        COALESCE(sub.name, 'Unassigned') AS subject_name,
        COUNT(*)::int AS total_classes,
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(class_group_id, id)) id, university_id, stream_id, subject_id, total_hours
        FROM class_entries
        WHERE date BETWEEN ${date_from} AND ${date_to}
        ORDER BY COALESCE(class_group_id, id), id
      ) g
      LEFT JOIN universities u ON u.id = g.university_id
      LEFT JOIN streams st ON st.id = g.stream_id
      LEFT JOIN subjects sub ON sub.id = g.subject_id
      GROUP BY u.id, u.name, st.id, st.name, sub.id, sub.name
      ORDER BY u.name, st.name, sub.name
    `;

    // Nest subjects under their stream, streams under their university.
    const grouped = {};
    for (const row of rows) {
      const uName = row.university_name;
      grouped[uName] ??= { university_name: uName, total_classes: 0, total_hours: 0, streams: {} };
      const uni = grouped[uName];
      uni.total_classes += Number(row.total_classes);
      uni.total_hours = Number((Number(uni.total_hours) + Number(row.total_hours)).toFixed(2));

      const sName = row.stream_name;
      uni.streams[sName] ??= { stream_name: sName, total_classes: 0, total_hours: 0, subjects: [] };
      const stream = uni.streams[sName];
      stream.total_classes += Number(row.total_classes);
      stream.total_hours = Number((Number(stream.total_hours) + Number(row.total_hours)).toFixed(2));
      stream.subjects.push({
        subject_name: row.subject_name,
        total_classes: Number(row.total_classes),
        total_hours: Number(row.total_hours),
      });
    }
    res.json(Object.values(grouped).map((u) => ({ ...u, streams: Object.values(u.streams) })));
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
    // recordings and uploads are syllabus snapshots, not date-ranged counts.
    const DATELESS = new Set(['class_overview', 'recordings', 'uploads']);
    if (!DATELESS.has(type) && (!date_from || !date_to)) {
      return res.status(400).json({ error: 'date_from and date_to are required.' });
    }

    let rows = [];

    if (type === 'faculty') {
      // Count a common-subject class (one session, many batch rows) once.
      rows = await sql`
        SELECT
          COALESCE(f.name, 'Unassigned') AS faculty_name,
          COUNT(*)::int AS total_classes,
          COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours,
          COUNT(*) FILTER (WHERE g.class_mode = 'online')::int AS online_classes,
          COUNT(*) FILTER (WHERE g.class_mode = 'offline')::int AS offline_classes,
          COUNT(*) FILTER (WHERE g.class_status = 'taken')::int AS taken_classes,
          COUNT(*) FILTER (WHERE g.class_status = 'scheduled')::int AS scheduled_classes,
          COUNT(*) FILTER (WHERE g.class_status = 'not_taken')::int AS not_taken_classes,
          COALESCE(SUM(g.total_hours) FILTER (WHERE g.payment_status = 'paid'), 0)::numeric(10,2) AS paid_hours,
          COALESCE(SUM(g.total_hours) FILTER (WHERE g.payment_status <> 'paid'), 0)::numeric(10,2) AS pending_hours
        FROM (
          SELECT DISTINCT ON (COALESCE(class_group_id, id))
            id, faculty_id, total_hours, class_mode, class_status, payment_status
          FROM class_entries
          WHERE date BETWEEN ${date_from} AND ${date_to}
          ORDER BY COALESCE(class_group_id, id), id
        ) g
        LEFT JOIN faculty f ON f.id = g.faculty_id
        GROUP BY f.id, f.name ORDER BY total_hours DESC
      `;
    } else if (type === 'recordings') {
      // Export the per-subject breakdown rather than two totals — a CSV of one
      // row is not worth downloading.
      rows = await sql`
        SELECT
          u.name AS university_name, st.name AS stream_name, sub.name AS subject_name,
          COUNT(*)::int AS chapters,
          COUNT(*) FILTER (WHERE r.is_recorded)::int AS recorded,
          COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS not_recorded,
          COUNT(*) FILTER (WHERE r.is_recorded AND NOT (
            COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false)
            OR COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false)
          ))::int AS pending_upload
        FROM academic_year_subjects ays
        JOIN academic_years ay ON ay.id = ays.academic_year_id
        JOIN streams st        ON st.id = ay.stream_id
        JOIN universities u    ON u.id = st.university_id
        JOIN subjects sub      ON sub.id = ays.subject_id
        JOIN chapters ch       ON ch.subject_id = ays.subject_id AND ch.is_active = true
        LEFT JOIN chapter_recordings r ON r.chapter_id = ch.id
        GROUP BY u.name, st.name, sub.name
        ORDER BY u.name, st.name, sub.name
      `;
    } else if (type === 'uploads') {
      rows = await sql`
        SELECT
          COALESCE(sub.name,'—') AS subject_name,
          COALESCE((
            SELECT string_agg(DISTINCT st.name, ', ')
            FROM academic_year_subjects ays
            JOIN academic_years ay ON ay.id = ays.academic_year_id
            JOIN streams st ON st.id = ay.stream_id
            WHERE ays.subject_id = ch.subject_id
          ), '—') AS streams,
          ch.title AS chapter_title,
          COALESCE(f.name,'Unassigned') AS faculty_name,
          r.recording_date, r.recording_duration, r.editing_status,
          r.backup_available, r.storage_location,
          r.upload_student_app, r.upload_youtube, r.youtube_privacy,
          r.upload_gdrive, r.upload_harddisk, r.upload_harddisk_location
        FROM chapter_recordings r
        JOIN chapters ch ON ch.id = r.chapter_id
        LEFT JOIN subjects sub ON sub.id = ch.subject_id
        LEFT JOIN faculty f ON f.id = r.faculty_id
        WHERE r.is_recorded = true
        ORDER BY sub.name, ch.chapter_order
      `;
    } else if (type === 'university') {
      // Same collapse as the /university endpoint — the CSV must agree with the
      // table it was exported from.
      rows = await sql`
        SELECT COALESCE(u.name,'Unassigned') AS university_name,
          COALESCE(st.name,'Unassigned') AS stream_name,
          COALESCE(sub.name,'Unassigned') AS subject_name,
          COUNT(*)::int AS total_classes,
          COALESCE(SUM(g.total_hours),0)::numeric(10,2) AS total_hours
        FROM (
          SELECT DISTINCT ON (COALESCE(class_group_id, id)) id, university_id, stream_id, subject_id, total_hours
          FROM class_entries
          WHERE date BETWEEN ${date_from} AND ${date_to}
          ORDER BY COALESCE(class_group_id, id), id
        ) g
        LEFT JOIN universities u ON u.id = g.university_id
        LEFT JOIN streams st ON st.id = g.stream_id
        LEFT JOIN subjects sub ON sub.id = g.subject_id
        GROUP BY u.id, u.name, st.id, st.name, sub.id, sub.name
        ORDER BY u.name, st.name, sub.name
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
