import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// NIOS is a parallel vertical with its own tables, so the main /reports endpoints
// (which only ever read class_entries / chapters) never saw any of it — NIOS
// teaching was invisible to every report. These mirror them over the nios_*
// tables, with the stream level the main app's university report doesn't have.

function requireDates(req, res) {
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) {
    res.status(400).json({ error: 'date_from and date_to are required.' });
    return null;
  }
  return { date_from, date_to };
}

// Each query below collapses common-subject classes: one session stored as one
// row per batch sharing a nios_class_group_id, so it must count once and add its
// hours once. COALESCE to the row's own id gives ungrouped classes a group of one.

router.get('/faculty', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;
    const rows = await sql`
      SELECT
        COALESCE(f.name, 'Unassigned') AS faculty_name,
        COUNT(*)::int AS total_classes,
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(nios_class_group_id, id)) id, faculty_id, total_hours
        FROM nios_class_entries
        WHERE date BETWEEN ${date_from} AND ${date_to}
        ORDER BY COALESCE(nios_class_group_id, id), id
      ) g
      LEFT JOIN faculty f ON f.id = g.faculty_id
      GROUP BY f.id, f.name
      ORDER BY total_hours DESC
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

// Recording is tracked per chapter and a chapter belongs to a subject, not to a
// placement, so the headline totals count chapters directly. Going through
// nios_stream_subjects would report a common subject's chapters once per stream.
//
// The per-stream breakdown DOES go through placements, because there a shared
// subject genuinely belongs to both streams — so those rows overlap by design and
// will not sum to the totals. The page labels that.
router.get('/recordings', auth, async (req, res, next) => {
  try {
    const uploaded = `(COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false)
                       OR COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false))`;

    const totals = await sql.query(`
      SELECT
        COUNT(*)::int AS total_chapters,
        COUNT(*) FILTER (WHERE r.is_recorded)::int AS recorded,
        COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS not_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded AND NOT ${uploaded})::int AS pending_upload,
        COUNT(*) FILTER (WHERE r.editing_status = 'edited')::int AS edited,
        COUNT(*) FILTER (WHERE r.backup_available)::int AS backed_up,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_youtube,false))::int AS on_youtube,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_gdrive,false))::int AS on_gdrive,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_student_app,false))::int AS on_student_app,
        COUNT(*) FILTER (WHERE r.is_recorded AND COALESCE(r.upload_harddisk,false))::int AS on_harddisk
      FROM nios_chapters ch
      LEFT JOIN nios_chapter_recordings r ON r.nios_chapter_id = ch.id
      WHERE ch.is_active = true`);

    const breakdown = await sql.query(`
      SELECT
        u.name AS university_name,
        st.name AS stream_name,
        sub.name AS subject_name,
        COUNT(*)::int AS chapters,
        COUNT(*) FILTER (WHERE r.is_recorded)::int AS recorded,
        COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS not_recorded,
        COUNT(*) FILTER (WHERE r.is_recorded AND NOT ${uploaded})::int AS pending_upload
      FROM nios_stream_subjects ss
      JOIN nios_streams st       ON st.id = ss.nios_stream_id
      JOIN nios_universities u   ON u.id = st.nios_university_id
      JOIN nios_subjects sub     ON sub.id = ss.nios_subject_id
      JOIN nios_chapters ch      ON ch.nios_subject_id = ss.nios_subject_id AND ch.is_active = true
      LEFT JOIN nios_chapter_recordings r ON r.nios_chapter_id = ch.id
      GROUP BY u.name, st.name, sub.name
      ORDER BY u.name, st.name, sub.name`);

    res.json({ ...totals[0], breakdown });
  } catch (err) { next(err); }
});

// Every NIOS recording with the detail that was captured but never surfaced:
// duration, editing state, backup, storage, and which destinations it reached.
// Streams are aggregated into one column rather than joined as rows, so a common
// subject's recording stays a single line.
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
          FROM nios_stream_subjects ss
          JOIN nios_streams st ON st.id = ss.nios_stream_id
          WHERE ss.nios_subject_id = ch.nios_subject_id
        ), '—') AS streams
      FROM nios_chapter_recordings r
      JOIN nios_chapters ch ON ch.id = r.nios_chapter_id
      LEFT JOIN nios_subjects sub ON sub.id = ch.nios_subject_id
      LEFT JOIN faculty f ON f.id = r.faculty_id
      WHERE r.is_recorded = true
      ORDER BY sub.name, ch.chapter_order
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

// Classes and hours per university, broken down by stream — the level that makes
// a NIOS board's Science and Commerce teaching separable.
router.get('/stream', auth, async (req, res, next) => {
  try {
    const dates = requireDates(req, res);
    if (!dates) return;
    const { date_from, date_to } = dates;
    const rows = await sql`
      SELECT
        COALESCE(u.name, 'Unassigned') AS university_name,
        COALESCE(st.name, 'Unassigned') AS stream_name,
        COALESCE(sub.name, 'Unassigned') AS subject_name,
        COUNT(*)::int AS total_classes,
        COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
      FROM (
        SELECT DISTINCT ON (COALESCE(nios_class_group_id, id)) id, nios_batch_id, nios_subject_id, total_hours
        FROM nios_class_entries
        WHERE date BETWEEN ${date_from} AND ${date_to}
        ORDER BY COALESCE(nios_class_group_id, id), id
      ) g
      LEFT JOIN nios_batches b ON b.id = g.nios_batch_id
      LEFT JOIN nios_universities u ON u.id = b.nios_university_id
      LEFT JOIN nios_streams st ON st.id = b.nios_stream_id
      LEFT JOIN nios_subjects sub ON sub.id = g.nios_subject_id
      GROUP BY u.id, u.name, st.id, st.name, sub.id, sub.name
      ORDER BY u.name, st.name, sub.name
    `;

    // Nest subjects under their stream, streams under their university, so the
    // page can render it as a drill-down rather than a flat table.
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
  } catch (err) { next(err); }
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
    if (!type) return res.status(400).json({ error: 'type is required.' });
    if (type !== 'recordings' && type !== 'uploads' && (!date_from || !date_to)) {
      return res.status(400).json({ error: 'date_from and date_to are required.' });
    }

    let rows = [];
    if (type === 'faculty') {
      rows = await sql`
        SELECT
          COALESCE(f.name, 'Unassigned') AS faculty_name,
          COUNT(*)::int AS total_classes,
          COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
        FROM (
          SELECT DISTINCT ON (COALESCE(nios_class_group_id, id)) id, faculty_id, total_hours
          FROM nios_class_entries
          WHERE date BETWEEN ${date_from} AND ${date_to}
          ORDER BY COALESCE(nios_class_group_id, id), id
        ) g
        LEFT JOIN faculty f ON f.id = g.faculty_id
        GROUP BY f.id, f.name ORDER BY total_hours DESC
      `;
    } else if (type === 'recordings') {
      // Export the per-subject breakdown rather than two totals — a CSV of one
      // row is not worth downloading.
      rows = await sql`
        SELECT
          u.name AS university_name,
          st.name AS stream_name,
          sub.name AS subject_name,
          COUNT(*)::int AS chapters,
          COUNT(*) FILTER (WHERE r.is_recorded)::int AS recorded,
          COUNT(*) FILTER (WHERE r.is_recorded IS NOT TRUE)::int AS not_recorded,
          COUNT(*) FILTER (WHERE r.is_recorded AND NOT (
            COALESCE(r.upload_youtube,false) OR COALESCE(r.upload_gdrive,false)
            OR COALESCE(r.upload_student_app,false) OR COALESCE(r.upload_harddisk,false)
          ))::int AS pending_upload
        FROM nios_stream_subjects ss
        JOIN nios_streams st     ON st.id = ss.nios_stream_id
        JOIN nios_universities u ON u.id = st.nios_university_id
        JOIN nios_subjects sub   ON sub.id = ss.nios_subject_id
        JOIN nios_chapters ch    ON ch.nios_subject_id = ss.nios_subject_id AND ch.is_active = true
        LEFT JOIN nios_chapter_recordings r ON r.nios_chapter_id = ch.id
        GROUP BY u.name, st.name, sub.name
        ORDER BY u.name, st.name, sub.name
      `;
    } else if (type === 'uploads') {
      rows = await sql`
        SELECT
          COALESCE(sub.name,'—') AS subject_name,
          COALESCE((
            SELECT string_agg(DISTINCT st.name, ', ')
            FROM nios_stream_subjects ss
            JOIN nios_streams st ON st.id = ss.nios_stream_id
            WHERE ss.nios_subject_id = ch.nios_subject_id
          ), '—') AS streams,
          ch.title AS chapter_title,
          COALESCE(f.name,'Unassigned') AS faculty_name,
          r.recording_date, r.recording_duration, r.editing_status,
          r.backup_available, r.storage_location,
          r.upload_student_app, r.upload_youtube, r.youtube_privacy,
          r.upload_gdrive, r.upload_harddisk, r.upload_harddisk_location
        FROM nios_chapter_recordings r
        JOIN nios_chapters ch ON ch.id = r.nios_chapter_id
        LEFT JOIN nios_subjects sub ON sub.id = ch.nios_subject_id
        LEFT JOIN faculty f ON f.id = r.faculty_id
        WHERE r.is_recorded = true
        ORDER BY sub.name, ch.chapter_order
      `;
    } else if (type === 'stream') {
      rows = await sql`
        SELECT
          COALESCE(u.name, 'Unassigned') AS university_name,
          COALESCE(st.name, 'Unassigned') AS stream_name,
          COALESCE(sub.name, 'Unassigned') AS subject_name,
          COUNT(*)::int AS total_classes,
          COALESCE(SUM(g.total_hours), 0)::numeric(10,2) AS total_hours
        FROM (
          SELECT DISTINCT ON (COALESCE(nios_class_group_id, id)) id, nios_batch_id, nios_subject_id, total_hours
          FROM nios_class_entries
          WHERE date BETWEEN ${date_from} AND ${date_to}
          ORDER BY COALESCE(nios_class_group_id, id), id
        ) g
        LEFT JOIN nios_batches b ON b.id = g.nios_batch_id
        LEFT JOIN nios_universities u ON u.id = b.nios_university_id
        LEFT JOIN nios_streams st ON st.id = b.nios_stream_id
        LEFT JOIN nios_subjects sub ON sub.id = g.nios_subject_id
        GROUP BY u.id, u.name, st.id, st.name, sub.id, sub.name
        ORDER BY u.name, st.name, sub.name
      `;
    } else {
      return res.status(400).json({ error: 'Invalid report type.' });
    }

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="nios_${type}_report.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
