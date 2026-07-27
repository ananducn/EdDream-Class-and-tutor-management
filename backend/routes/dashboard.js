import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { cacheRoute } from '../middleware/cache.js';

const router = express.Router();

router.get('/summary', auth, cacheRoute(30000), async (req, res, next) => {
  try {
    const [
      totalRows,
      onlineRows,
      offlineRows,
      pendingRecRows,
      pendingUploadRows,
      facultyHoursRows,
      activityRows,
    ] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM class_entries
          WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`,

      sql`SELECT COUNT(*) AS count FROM class_entries
          WHERE class_mode = 'online'
          AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`,

      sql`SELECT COUNT(*) AS count FROM class_entries
          WHERE class_mode = 'offline'
          AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`,

      // Recording is now tracked per chapter (shared across batches), so
      // "pending recordings" = active chapters not yet marked recorded.
      sql`SELECT COUNT(*) AS count FROM chapters ch
          WHERE ch.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM chapter_recordings r
            WHERE r.chapter_id = ch.id AND r.is_recorded = true
          )`,

      // "pending uploads" = recorded chapters not yet on any destination.
      sql`SELECT COUNT(*) AS count FROM chapter_recordings r
          WHERE r.is_recorded = true
          AND COALESCE(r.upload_student_app, false) = false
          AND COALESCE(r.upload_youtube, false) = false
          AND COALESCE(r.upload_gdrive, false) = false
          AND COALESCE(r.upload_harddisk, false) = false`,

      // A common-subject class is one teaching session split across several
      // batches (one row per batch, same faculty + hours). Faculty taught it once,
      // so collapse each group to a single row before summing hours — otherwise a
      // class shared by N batches would count as N× the hours.
      sql`SELECT f.name AS faculty_name, COALESCE(SUM(g.total_hours), 0) AS total_hours
          FROM faculty f
          LEFT JOIN (
            SELECT DISTINCT ON (COALESCE(ce.class_group_id, ce.id))
                   ce.faculty_id, ce.total_hours
            FROM class_entries ce
            WHERE DATE_TRUNC('month', ce.date) = DATE_TRUNC('month', CURRENT_DATE)
            ORDER BY COALESCE(ce.class_group_id, ce.id), ce.id
          ) g ON g.faculty_id = f.id
          WHERE f.is_active = true
          GROUP BY f.id, f.name
          HAVING COALESCE(SUM(g.total_hours), 0) > 0
          ORDER BY total_hours DESC`,

      req.user.role === 'admin'
        ? sql`SELECT al.*, u.name AS user_name FROM activity_logs al
              LEFT JOIN users u ON u.id = al.user_id
              ORDER BY al.created_at DESC LIMIT 10`
        : Promise.resolve([]),
    ]);

    res.json({
      total_classes_this_month: Number(totalRows[0].count),
      online_this_month: Number(onlineRows[0].count),
      offline_this_month: Number(offlineRows[0].count),
      pending_recordings: Number(pendingRecRows[0].count),
      pending_uploads: Number(pendingUploadRows[0].count),
      faculty_hours: facultyHoursRows,
      recent_activity: activityRows,
    });
  } catch (err) { next(err); }
});

export default router;
