import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';

const emptyForm = { name: '', university_id: '', stream_id: '' };
const emptyFilters = { search: '', university_id: '', stream_id: '', status: '' };

export default function BatchesPage() {
  const confirm = useConfirm();
  const [batches, setBatches] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);

  // Stream options for the filter, derived from the loaded batches and scoped to
  // the selected university so the choices always match what's on screen.
  const streamOptions = useMemo(() => {
    const seen = new Map();
    for (const b of batches) {
      if (!b.stream_id || !b.stream_name) continue;
      if (filters.university_id && String(b.university_id) !== filters.university_id) continue;
      seen.set(String(b.stream_id), b.stream_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [batches, filters.university_id]);

  const filtered = useMemo(() => batches.filter((b) => {
    if (filters.search && !b.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.university_id && String(b.university_id) !== filters.university_id) return false;
    if (filters.stream_id && String(b.stream_id) !== filters.stream_id) return false;
    if (filters.status === 'active' && !b.is_active) return false;
    if (filters.status === 'inactive' && b.is_active) return false;
    return true;
  }), [batches, filters]);

  async function load() {
    try {
      const [batchRes, uniRes] = await Promise.all([
        client.get('/batches?include_inactive=true'),
        client.get('/universities'),
      ]);
      setBatches(batchRes.data);
      setUniversities(uniRes.data);
    } catch {
      toast.error('Failed to load data.');
    }
  }

  useEffect(() => { load(); }, []);

  async function loadStreams(universityId) {
    if (!universityId) { setStreams([]); return; }
    try {
      const res = await client.get(`/streams?university_id=${universityId}`);
      setStreams(res.data);
    } catch {
      setStreams([]);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setStreams([]);
    setDialogOpen(true);
  }

  function openEdit(b) {
    setEditing(b);
    setForm({
      name: b.name,
      university_id: String(b.university_id),
      stream_id: b.stream_id ? String(b.stream_id) : '',
    });
    loadStreams(b.university_id);
    setDialogOpen(true);
  }

  function handleUniversityChange(v) {
    setForm({ ...form, university_id: v, stream_id: '' });
    loadStreams(v);
  }

  function handleStreamChange(v) {
    setForm((f) => ({ ...f, stream_id: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await client.put(`/batches/${editing.id}`, form);
        toast.success('Batch updated.');
      } else {
        await client.post('/batches', form);
        toast.success('Batch created.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(b) {
    const ok = await confirm({
      title: 'Deactivate batch?',
      description: `Are you sure you want to deactivate "${b.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/batches/${b.id}`);
      toast.success(`${b.name} deactivated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate.');
    }
  }

  async function handleActivate(b) {
    try {
      await client.patch(`/batches/${b.id}/activate`);
      toast.success(`${b.name} activated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate.');
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Batches</h1>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input placeholder="Batch name" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>University</Label>
              <Select value={filters.university_id} onValueChange={(v) => setFilters({ ...filters, university_id: v, stream_id: '' })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stream</Label>
              <Select value={filters.stream_id} onValueChange={(v) => setFilters({ ...filters, stream_id: v })} disabled={streamOptions.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {streamOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex mt-3">
            <Button size="sm" variant="outline" onClick={() => setFilters(emptyFilters)}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Batches ({filtered.length})</CardTitle>
          <Button size="sm" onClick={openAdd}>Add New</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Stream</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">{batches.length === 0 ? 'No batches yet.' : 'No batches match your filters.'}</TableCell>
                </TableRow>
              )}
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{b.name}</TableCell>
                  <TableCell>{b.university_name || '—'}</TableCell>
                  <TableCell>{b.stream_name || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={b.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                    {b.is_active ? (
                      <Button size="sm" variant="outline" onClick={() => handleDeactivate(b)}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900" onClick={() => handleActivate(b)}>Activate</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Batch' : 'Add Batch'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>University *</Label>
              <Select value={form.university_id} onValueChange={handleUniversityChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select university" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stream *</Label>
              <Select value={form.stream_id} onValueChange={handleStreamChange} disabled={!form.university_id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select stream" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The batch inherits its stream's syllabus and chapter recordings automatically — no copying needed.
            </p>
            <DialogFooter>
              <Button type="submit" disabled={saving || !form.university_id || !form.stream_id}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
