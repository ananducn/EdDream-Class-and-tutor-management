import { cn } from '@/lib/utils';

// Base skeleton block: a pulsing placeholder. Give it a width/height via className.
function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-700/60', className)}
      {...props}
    />
  );
}

export { Skeleton };
