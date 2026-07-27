import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useDashboardSummary } from '@/api/queries';
import { SkeletonStats, SkeletonTable } from '@/components/Skeletons';

function StatCard({ label, value, highlight }) {
  return (
    <Card className={`border-l-4 ${highlight ? 'border-l-red-500' : 'border-l-indigo-500'}`}>
      <CardContent className="pt-4 pb-4 flex flex-col items-center justify-center gap-1">
        <p className={`text-3xl font-bold ${highlight ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {value ?? '—'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{label}</p>
      </CardContent>
    </Card>
  );
}

// Panels are fixed-height so the dashboard keeps a stable layout no matter how
// much data lands in them; anything longer scrolls inside its own card. Card is
// already `flex flex-col`, so the header stays put and the content flexes —
// min-h-0 is what lets that content shrink below its natural height and scroll.
const PANEL = 'h-96 flex flex-col';
const PANEL_SM = 'h-80 flex flex-col';
const PANEL_BODY = 'flex-1 min-h-0 overflow-y-auto';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  // React Query caches this in memory: returning to the Dashboard renders the last
  // data instantly and refreshes in the background instead of blocking on a fetch.
  const { data, isLoading: loading } = useDashboardSummary();

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <SkeletonStats count={4} />
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Classes This Month" value={data?.total_classes_this_month} />
        <StatCard label="Online This Month" value={data?.online_this_month} />
        <StatCard label="Offline This Month" value={data?.offline_this_month} />
        <StatCard label="Pending Recordings" value={data?.pending_recordings} highlight={data?.pending_recordings > 0} />
      </div>

      {/* Faculty Hours */}
      <Card className={PANEL}>
        <CardHeader>
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Faculty Hours — This Month</CardTitle>
        </CardHeader>
        <CardContent className={PANEL_BODY}>
          {!data?.faculty_hours?.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No classes recorded this month yet.</p>
          ) : (
            <Table>
              {/* Header stays visible while the rows scroll under it. */}
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 z-10 bg-card text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Faculty</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card text-right text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.faculty_hours.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-slate-900 dark:text-slate-100">{row.faculty_name}</TableCell>
                    <TableCell className="text-right text-slate-700 dark:text-slate-300">{Number(row.total_hours).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Uploads + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={PANEL_SM}>
          <CardHeader>
            <CardTitle className="text-base text-slate-900 dark:text-slate-100">Pending Uploads</CardTitle>
          </CardHeader>
          <CardContent className={`${PANEL_BODY} space-y-3`}>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{data?.pending_uploads ?? 0}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Chapters that are recorded but not uploaded to any destination yet.
            </p>
            <Button size="sm" asChild>
              <Link to="/recording-overview">Manage Recordings</Link>
            </Button>
          </CardContent>
        </Card>

        {isAdmin() && (
          <Card className={PANEL_SM}>
            <CardHeader>
              <CardTitle className="text-base text-slate-900 dark:text-slate-100">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className={PANEL_BODY}>
              {!data?.recent_activity?.length ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.recent_activity.map((log) => (
                    <div key={log.id} className="flex items-start justify-between text-sm gap-2">
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{log.user_name || 'Unknown'}</span>
                        <span className="text-slate-500 dark:text-slate-400"> · {log.action.replace(/_/g, ' ')}</span>
                        {log.details && <p className="text-xs text-slate-500 dark:text-slate-400">{log.details}</p>}
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{timeAgo(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
