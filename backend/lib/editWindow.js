import { nowInZone } from './week.js';

// How long a class that is already marked "taken" stays editable, counted in days
// from the class date. Past the admin window nobody can change it — attendance
// feeds the faculty hours report, so old records are closed rather than silently
// rewritable.
export const EDIT_WINDOW_DAYS = { staff: 7, admin: 30 };

// A DATE column comes back from pg as a Date at local midnight, but may also be a
// plain 'YYYY-MM-DD' string. Read calendar parts either way, never via
// toISOString() which would shift the day for anyone east of UTC.
function toDateStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// Whether `role` may still edit or delete this class.
//
// Only classes already marked taken are ever locked — a scheduled or not-taken
// class stays editable however old it is, so a missed record can still be filled
// in. Returns null when the edit is allowed, or a message explaining the lock.
//
// Pass the class row as it exists in the database, not the incoming body: the
// check keys off the stored status and date so a request cannot dodge the window
// by sending a different date.
export function takenEditLock(existing, role) {
  if (!existing || existing.class_status !== 'taken') return null;

  const classDate = toDateStr(existing.date);
  if (!classDate) return null;

  const age = daysBetween(classDate, nowInZone().date);
  if (age <= 0) return null; // held today or future-dated — nothing to lock yet

  if (age > EDIT_WINDOW_DAYS.admin) {
    return `This class was held on ${classDate}. Classes marked taken are locked ${EDIT_WINDOW_DAYS.admin} days afterwards and can no longer be changed.`;
  }
  if (role !== 'admin' && age > EDIT_WINDOW_DAYS.staff) {
    return `This class was held on ${classDate}. Staff can change a class marked taken for ${EDIT_WINDOW_DAYS.staff} days; after that an admin can still change it for up to ${EDIT_WINDOW_DAYS.admin} days.`;
  }
  return null;
}
