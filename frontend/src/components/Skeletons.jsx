import { Skeleton } from '@/components/ui/skeleton';

// Page-level skeleton composites that mirror common layouts, so a fetching page
// shows greyed-out placeholders matching its real content instead of a spinner.

// A table-like block: a header row of labels plus `rows` × `cols` cells.
export function SkeletonTable({ rows = 6, cols = 5, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      <div className="grid gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
           style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 w-3/4" />)}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-3 px-4 py-3.5"
               style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-1/2' : 'w-5/6'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// A responsive grid of card placeholders (for card-based drill-down pages).
export function SkeletonCards({ count = 6, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// A row of stat-tile placeholders (dashboards / overview headers).
export function SkeletonStats({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-1/3" />
        </div>
      ))}
    </div>
  );
}
