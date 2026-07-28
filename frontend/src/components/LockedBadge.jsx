// Why a taken class can no longer be edited, shown on the row itself.
//
// A `title` on a disabled button renders no tooltip in Chrome or Safari —
// disabled elements don't receive pointer events — so greyed-out buttons alone
// left the user with no explanation. This puts the reason on the page, and the
// hover text on a wrapper that isn't disabled so it actually appears.
export default function LockedBadge({ reason }) {
  if (!reason) return null;
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium
                 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300
                 border border-slate-200 dark:border-slate-700 cursor-help align-middle"
    >
      🔒 Locked
    </span>
  );
}

// Wraps a disabled control so its explanation is reachable on hover. The wrapper
// is not disabled, so it still fires the tooltip.
export function LockHint({ reason, children }) {
  if (!reason) return children;
  return (
    <span title={reason} className="inline-block cursor-help">
      {children}
    </span>
  );
}
