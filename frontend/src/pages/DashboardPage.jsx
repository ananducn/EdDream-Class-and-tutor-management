import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/dashboard/summary')
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading dashboard...</p>;
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Faculty Hours — This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.faculty_hours?.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No classes recorded this month yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Faculty</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Hours</TableHead>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-900 dark:text-slate-100">Pending Uploads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{data?.pending_uploads ?? 0}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Classes that are recorded but not uploaded anywhere yet.
            </p>
            <Button size="sm" asChild>
              <Link to="/classes?is_recorded=true&upload_student_app=false">View Classes</Link>
            </Button>
          </CardContent>
        </Card>

        {isAdmin() && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-slate-900 dark:text-slate-100">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
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
