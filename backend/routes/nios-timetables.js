import express from 'express';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { DAYS, dateForSlot } from '../lib/week.js';

const router = express.Router();

function hoursBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : null;
}

async function syncNiosClassForSlot(slot, timetable, userId) {
  const status = slot.class_taken_status;
  const existing = await sql`SELECT id FROM nios_class_entries WHERE nios_timetable_slot_id = ${slot.id}`;

  if (existing[0]) {
    await sql`
      UPDATE nios_class_entries SET class_status = ${status}, updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    return;
  }

  if (status === 'not_taken') return;
  if (!timetable?.week_start_date) return;

  const date = dateForSlot(timetable.week_start_date, slot.day_of_week);
  if (!date) return;

  await sql`
    INSERT INTO nios_class_entries (
      date, start_time, end_time, total_hours,
      faculty_id, nios_batch_id, nios_subject_id,
      class_status, nios_timetable_slot_id, created_by
    ) VALUES (
      ${date}, ${slot.start_time || null}, ${slot.end_time || null},
      ${hoursBetween(slot.start_time, slot.end_time)},
      ${slot.faculty_id || null}, ${timetable.nios_batch_id || null},
      ${slot.nios_subject_id || null},
      'taken', ${slot.id}, ${userId}
    )
  `;
}

async function niosSlotContext(row, timetableId) {
  const rows = await sql`
    SELECT
      (SELECT name FROM faculty WHERE id = ${row.faculty_id}) AS faculty_name,
      (SELECT name FROM nios_subjects WHERE id = ${row.nios_subject_id}) AS subject_name,
      (SELECT name FROM nios_timetables WHERE id = ${timetableId}) AS timetable_name
  `;
  return rows[0];
}

function niosSlotDetail(row, ctx) {
  const time = row.start_time && row.end_time ? ` ${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}` : '';
  return `${ctx.subject_name || 'Subject N/A'} with ${ctx.faculty_name || 'Faculty N/A'} on ${row.day_of_week}${time} — ${ctx.timetable_name || 'timetable N/A'}`;
}

// ── Timetables ────────────────────────────────────────────────────────────────

router.get('/', auth, async (req, res, next) => {
  try {
    const { nios_university_id, nios_batch_id } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (nios_university_id) { conditions.push(`t.nios_university_id = $${i++}`); params.push(nios_university_id); }
    if (nios_batch_id)      { conditions.push(`t.nios_batch_id = $${i++}`);      params.push(nios_batch_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await sql.query(
      `SELECT t.*, to_char(t.week_start_date, 'YYYY-MM-DD') AS week_start_date,
              u.name AS university_name, b.name AS batch_name
       FROM nios_timetables t
       LEFT JOIN nios_universities u ON u.id = t.nios_university_id
       LEFT JOIN nios_batches b ON b.id = t.nios_batch_id
       ${where}
       ORDER BY t.week_start_date DESC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const timetables = await sql`
      SELECT t.*, to_char(t.week_start_date, 'YYYY-MM-DD') AS week_start_date,
             u.name AS university_name, b.name AS batch_name
      FROM nios_timetables t
      LEFT JOIN nios_universities u ON u.id = t.nios_university_id
      LEFT JOIN nios_batches b ON b.id = t.nios_batch_id
      WHERE t.id = ${req.params.id}
    `;
    if (!timetables[0]) return res.status(404).json({ error: 'Not found.' });

    const slots = await sql`
      SELECT ts.*, f.name AS faculty_name, sub.name AS subject_name
      FROM nios_timetable_slots ts
      LEFT JOIN faculty f ON f.id = ts.faculty_id
      LEFT JOIN nios_subjects sub ON sub.id = ts.nios_subject_id
      WHERE ts.nios_timetable_id = ${req.params.id}
      ORDER BY ts.start_time
    `;
    res.json({ ...timetables[0], slots });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, nios_university_id, nios_batch_id, week_start_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const rows = await sql`
      INSERT INTO nios_timetables (name, nios_university_id, nios_batch_id, week_start_date, created_by)
      VALUES (${name}, ${nios_university_id || null}, ${nios_batch_id || null}, ${week_start_date || null}, ${req.user.id})
      RETURNING *
    `;
    const placeCtx = await sql`
      SELECT
        (SELECT name FROM nios_universities WHERE id = ${nios_university_id || null}) AS university_name,
        (SELECT name FROM nios_batches WHERE id = ${nios_batch_id || null}) AS batch_name
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_nios_timetable', 'nios_timetable', rows[0].id,
      `Created NIOS timetable: ${name}${placeCtx[0].batch_name ? ` for ${placeCtx[0].batch_name}` : ''}${placeCtx[0].university_name ? ` (${placeCtx[0].university_name})` : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, week_start_date } = req.body;
    const rows = await sql`
      UPDATE nios_timetables SET
        name = COALESCE(${name || null}, name),
        week_start_date = COALESCE(${week_start_date || null}, week_start_date)
      WHERE id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_timetable', 'nios_timetable', rows[0].id, `Updated NIOS timetable: ${rows[0].name}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
    const rows = await sql`DELETE FROM nios_timetables WHERE id = ${req.params.id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_timetable', 'nios_timetable', rows[0].id, `Deleted NIOS timetable: ${rows[0].name}`);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ── Slots ─────────────────────────────────────────────────────────────────────

router.post('/:id/slots', auth, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, faculty_id, nios_subject_id, notes, class_taken_status } = req.body;
    if (!day_of_week || !DAYS.includes(day_of_week)) {
      return res.status(400).json({ error: 'Valid day_of_week is required.' });
    }

    const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${req.params.id}`;
    if (!tt[0]) return res.status(404).json({ error: 'Timetable not found.' });

    const sameDay = await sql`
      SELECT start_time, end_time FROM nios_timetable_slots
      WHERE nios_timetable_id = ${req.params.id} AND day_of_week = ${day_of_week}
    `;
    const clash = sameDay.some((s) => {
      if (!start_time || !end_time || !s.start_time || !s.end_time) return false;
      return start_time.slice(0, 5) < s.end_time.slice(0, 5) && s.start_time.slice(0, 5) < end_time.slice(0, 5);
    });
    if (clash) return res.status(409).json({ error: `A slot already exists on ${day_of_week} at this time.` });

    const rows = await sql`
      INSERT INTO nios_timetable_slots (nios_timetable_id, day_of_week, start_time, end_time, faculty_id, nios_subject_id, notes, class_taken_status)
      VALUES (${req.params.id}, ${day_of_week}, ${start_time || null}, ${end_time || null},
              ${faculty_id || null}, ${nios_subject_id || null}, ${notes || null}, ${class_taken_status || 'scheduled'})
      RETURNING *
    `;
    if (rows[0].class_taken_status !== 'not_taken') {
      await syncNiosClassForSlot(rows[0], tt[0], req.user.id);
    }
    const addCtx = await niosSlotContext(rows[0], req.params.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'add_nios_slot', 'nios_timetable_slot', rows[0].id, `Added NIOS slot: ${niosSlotDetail(rows[0], addCtx)}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, faculty_id, nios_subject_id, notes, class_taken_status } = req.body;

    if (class_taken_status === 'taken') {
      const [tt, existing] = await Promise.all([
        sql`SELECT to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${req.params.id}`,
        sql`SELECT day_of_week, start_time FROM nios_timetable_slots WHERE id = ${req.params.slotId}`,
      ]);
      if (existing[0] && tt[0]?.week_start_date) {
        const slotDate = dateForSlot(tt[0].week_start_date, existing[0].day_of_week);
        const slotTime = (existing[0].start_time || '00:00').slice(0, 5);
        const nowISO = new Date().toISOString();
        const todayUTC = nowISO.slice(0, 10);
        const nowTimeUTC = nowISO.slice(11, 16);
        if (slotDate > todayUTC || (slotDate === todayUTC && slotTime > nowTimeUTC)) {
          return res.status(409).json({ error: `This class is scheduled for ${slotDate} at ${slotTime}. It can only be marked as taken after that time.` });
        }
      }
    }

    const rows = await sql`
      UPDATE nios_timetable_slots SET
        day_of_week = COALESCE(${day_of_week || null}, day_of_week),
        start_time = COALESCE(${start_time || null}, start_time),
        end_time = COALESCE(${end_time || null}, end_time),
        faculty_id = ${faculty_id || null},
        nios_subject_id = ${nios_subject_id || null},
        notes = ${notes || null},
        class_taken_status = COALESCE(${class_taken_status || null}, class_taken_status),
        updated_at = NOW()
      WHERE id = ${req.params.slotId} AND nios_timetable_id = ${req.params.id}
      RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });

    if (class_taken_status) {
      const tt = await sql`SELECT *, to_char(week_start_date, 'YYYY-MM-DD') AS week_start_date FROM nios_timetables WHERE id = ${req.params.id}`;
      await syncNiosClassForSlot(rows[0], tt[0], req.user.id);
    }
    const updCtx = await niosSlotContext(rows[0], req.params.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_nios_slot', 'nios_timetable_slot', rows[0].id,
      `Updated NIOS slot (status: ${rows[0].class_taken_status}): ${niosSlotDetail(rows[0], updCtx)}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id/slots/:slotId', auth, async (req, res, next) => {
  try {
    const rows = await sql`
      DELETE FROM nios_timetable_slots WHERE id = ${req.params.slotId} AND nios_timetable_id = ${req.params.id} RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const delCtx = await niosSlotContext(rows[0], req.params.id);
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_nios_slot', 'nios_timetable_slot', rows[0].id, `Deleted NIOS slot: ${niosSlotDetail(rows[0], delCtx)}`);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

export default router;
