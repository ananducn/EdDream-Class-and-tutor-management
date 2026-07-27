// Week/date helpers for the per-week timetable model.
// All functions work on plain 'YYYY-MM-DD' strings using UTC parts so they are
// not affected by the server's local timezone.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parse(dateStr) {
  // Accept a Date object (Neon returns DATE columns as Date), an ISO timestamp,
  // or a plain 'YYYY-MM-DD' string. Always read calendar parts in UTC.
  if (dateStr instanceof Date) {
    return new Date(Date.UTC(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate()));
  }
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date) {
  // Never emit a malformed string like "NaN-NaN-NaN" that would blow up a SQL
  // date insert downstream — callers treat null as "no date".
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Monday (as 'YYYY-MM-DD') of the week containing the given date, or null if the
// input can't be resolved to a valid date.
export function mondayOf(dateStr) {
  const d = parse(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return format(d);
}

// Day name ('Monday'…'Sunday') for the given date, or null if invalid.
export function dayNameOf(dateStr) {
  const d = parse(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return DAYS[day === 0 ? 6 : day - 1];
}

// Actual date ('YYYY-MM-DD') of a slot, given its timetable's week start and day name.
// Returns null (never a malformed string) if inputs can't be resolved to a date.
export function dateForSlot(weekStartDate, dayName) {
  const idx = DAYS.indexOf(dayName);
  if (idx < 0 || !weekStartDate) return null;
  const d = parse(weekStartDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + idx);
  return format(d);
}

// Do two [start,end) time ranges overlap? Times are 'HH:MM' or 'HH:MM:SS' strings.
export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return true; // missing times → treat as clashing on same day
  const t = (s) => s.slice(0, 5);
  return t(aStart) < t(bEnd) && t(bStart) < t(aEnd);
}

// "Now" as calendar parts in the institute's own timezone.
//
// Class dates and times are stored as bare wall-clock values (DATE + TIME with no
// zone) — 14:00 means 2pm where the institute is. Comparing those against
// new Date().toISOString(), which is UTC, made a class look like it was still in
// the future for as long as the UTC offset: 5h30m in IST, so a 14:00 class could
// not be marked taken until 19:30 local. Compare against local parts instead.
//
// Override with INSTITUTE_TZ if the institute is not in India.
export function nowInZone(tz = process.env.INSTITUTE_TZ || 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Duration between two 'HH:MM'/'HH:MM:SS' times, as a 2-dp string, or null when
// either is missing or the range is not positive. Class hours feed the faculty
// hours report, so they are derived from the times rather than trusted from the
// request body — a client sending stale hours with new times would otherwise be
// stored as-is.
export function hoursBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : null;
}
