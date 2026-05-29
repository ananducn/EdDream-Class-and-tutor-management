import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import client from '@/api/client';

function formatTs(str) {
  return new Date(str).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityLogPage() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({ user_id: '', date_from: '', date_to: '' });
  const [applied, setApplied] = useState({ user_id: '', date_from: '', date_to: '' });

  useEffect(() => {
    client.get('/users').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  async function loadLogs(appliedFilters, pageNum) {
    setLoading(true);
    try {
      const params = { page: pageNum };
      if (appliedFilters.user_id)   params.user_id   = appliedFilters.user_id;
      if (appliedFilters.date_from) params.date_from = appliedFilters.date_from;
      if (appliedFilters.date_to)   params.date_to   = appliedFilters.date_to;

      const res = await client.get('/activity-logs', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch {
      toast.error('Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLogs(applied, page); }, [applied, page]);

  function handleFilter(e) {
    e.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  }

  function handleClear() {
    const empty = { user_id: '', date_from: '', date_to: '' };
    setFilters(empty);
    setApplied(empty);
    setPage(1);
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Activity Log</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500 dark:text-slate-400">User</Label>
              <Select
                value={filters.user_id}
                onValueChange={(v) => setFilters({ ...filters, user_id: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-44"><SelectValue placeholder="All users" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500 dark:text-slate-400">From</Label>
              <Input type="date" className="w-36" value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500 dark:text-slate-400">To</Label>
              <Input type="date" className="w-36" value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
            </div>
            <Button type="submit" disabled={loading}>Filter</Button>
            <Button type="button" variant="outline" onClick={handleClear}>Clear</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !logs.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No activity found.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">{total} record{total !== 1 ? 's' : ''}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Timestamp</TableHead>
                    <TableHead className={TH}>User</TableHead>
                    <TableHead className={TH}>Role</TableHead>
                    <TableHead className={TH}>Action</TableHead>
                    <TableHead className={TH}>Record Type</TableHead>
                    <TableHead className={TH}>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{formatTs(log.created_at)}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{log.user_name || '—'}</TableCell>
                      <TableCell className="capitalize text-slate-600 dark:text-slate-300">{log.user_role || '—'}</TableCell>
                      <TableCell>{log.action?.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{log.record_type || '—'}</TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400 text-xs">{log.details || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
