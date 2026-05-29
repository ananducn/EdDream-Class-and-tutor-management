import { Badge } from '@/components/ui/badge';

const VARIANTS = {
  active:       'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
  inactive:     'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  recorded:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200',
  not_recorded: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  edited:       'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
  not_edited:   'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200',
  paid:         'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
  pending:      'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200',
  online:       'bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200',
  offline:      'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  taken:        'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
  scheduled:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200',
  not_taken:    'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200',
};

const LABELS = {
  active: 'Active', inactive: 'Inactive',
  recorded: 'Recorded', not_recorded: 'Not Recorded',
  edited: 'Edited', not_edited: 'Not Edited',
  paid: 'Paid', pending: 'Pending',
  online: 'Online', offline: 'Offline',
  taken: 'Taken', scheduled: 'Scheduled', not_taken: 'Not Taken',
};

export default function StatusBadge({ status, label }) {
  const cls = VARIANTS[status] ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return (
    <Badge className={`${cls} border-0 font-medium`}>
      {label ?? LABELS[status] ?? status ?? '—'}
    </Badge>
  );
}
