import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/activity-logs
router.get('/', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });

    const { user_id, action, record_type, date_from, date_to, page = '1' } = req.query;
    const PAGE_SIZE = 50;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;

    const conditions = [];
    const params = [];
    let i = 1;

    if (user_id)     { conditions.push(`user_id = $${i++}`);                       params.push(user_id); }
    if (action)      { conditions.push(`action = $${i++}`);                        params.push(action); }
    if (record_type) { conditions.push(`record_type = $${i++}`);                   params.push(record_type); }
    if (date_from)   { conditions.push(`created_at >= $${i++}`);                   params.push(date_from); }
    if (date_to)     { conditions.push(`created_at < ($${i++}::date + interval '1 day')`); params.push(date_to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const countQuery = `SELECT COUNT(*)::int AS total FROM activity_logs ${where}`;
    const countRows = await sql.query(countQuery, countParams);
    const total = countRows[0]?.total ?? 0;

    const dataParams = [...params, PAGE_SIZE, offset];
    const dataQuery = `
      SELECT id, user_id, user_name, user_role, action, record_type, record_id, details, created_at
      FROM activity_logs ${where}
      ORDER BY created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const logs = await sql.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.json({ logs, total, page: parseInt(page), total_pages: totalPages });
  } catch (err) {
    console.error('GET /activity-logs error:', err);
    next(err);
  }
});

export default router;
