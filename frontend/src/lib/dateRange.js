// Class lists default to the last three months.
//
// Without a default, opening /classes fetched every class ever recorded — 362 KB
// at 458 rows, and growing by roughly 5,700 classes a year. The backend already
// filters on date_from/date_to, so this is purely the starting point of the
// filter form.
//
// An explicit range always wins: widen the dates and you get exactly what you
// ask for, however many years back. Clearing the filters returns to this default
// rather than to "everything".
//
// Only the start is set — date_to is left open so upcoming classes stay visible.
// Closing the window at today would hide every scheduled class (half the rows
// when this was measured), which is the opposite of useful on a class list.
// Unbounded *history* is what grows without limit, roughly 5,700 classes a year;
// the future is naturally bounded by how far ahead anyone schedules.
// Plain-English summary of whichever range is actually loaded, so the list always
// says what it is showing rather than leaving the user to read it off the two date
// inputs. Reflects the applied filters, not what is half-typed in the boxes.
export function describeDateRange(from, to) {
  const pretty = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return s;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${MONTHS[m - 1]} ${y}`;
  };
  if (from && to) return `Showing ${pretty(from)} – ${pretty(to)}.`;
  if (from)       return `Showing ${pretty(from)} onwards, including upcoming classes.`;
  if (to)         return `Showing everything up to ${pretty(to)}.`;
  return 'Showing all dates.';
}

export function defaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date_from: fmt(from), date_to: '' };
}
