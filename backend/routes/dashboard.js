import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', auth, async (req, res, next) => {
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

      sql`SELECT COUNT(*) AS count FROM class_entries
          WHERE is_recorded = false
          AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`,

      sql`SELECT COUNT(*) AS count FROM class_entries
          WHERE is_recorded = true
          AND upload_student_app = false
          AND upload_youtube = false
          AND upload_gdrive = false
          AND upload_harddisk = false`,

      sql`SELECT f.name AS faculty_name, COALESCE(SUM(ce.total_hours), 0) AS total_hours
          FROM faculty f
          LEFT JOIN class_entries ce ON ce.faculty_id = f.id
            AND DATE_TRUNC('month', ce.date) = DATE_TRUNC('month', CURRENT_DATE)
          WHERE f.is_active = true
          GROUP BY f.id, f.name
          HAVING COALESCE(SUM(ce.total_hours), 0) > 0
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
