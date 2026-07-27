// Format a "HH:MM[:SS]" time string as 12-hour with AM/PM, e.g. "15:05" -> "03:05 PM".
//
// Times are stored and edited as 24-hour (a <input type="time"> requires it), but
// everywhere they are *displayed* they should read the way people say them.
// Returns the input unchanged if it isn't a parseable time, so a null or an odd
// value never renders as "NaN".
export function to12h(t) {
  if (!t) return t;
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return t;
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
}
