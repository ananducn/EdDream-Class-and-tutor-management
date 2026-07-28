// Mirrors backend/lib/editWindow.js so the UI can grey out what the API would
// refuse. The server is the authority — this only avoids showing buttons that
// would come back 403.
export const EDIT_WINDOW_DAYS = { staff: 7, admin: 30 };

function toDateStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysSince(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - Date.UTC(y, m - 1, d)) / 86400000);
}

// Why a taken class can no longer be edited, or null when it still can.
// `status` and `date` are the class's own; isAdmin picks which window applies.
export function takenLockReason(status, date, isAdmin) {
  if (status !== 'taken') return null;
  const classDate = toDateStr(date);
  if (!classDate) return null;
  const age = daysSince(classDate);
  if (age <= 0) return null;
  if (age > EDIT_WINDOW_DAYS.admin) {
    return `Locked — classes marked taken can't be changed more than ${EDIT_WINDOW_DAYS.admin} days after the class date.`;
  }
  if (!isAdmin && age > EDIT_WINDOW_DAYS.staff) {
    return `Locked for staff after ${EDIT_WINDOW_DAYS.staff} days. An admin can still change this for up to ${EDIT_WINDOW_DAYS.admin} days.`;
  }
  return null;
}
