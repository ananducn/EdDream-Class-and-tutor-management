import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import client from '@/api/client';

const emptyForm = { name: '', university_id: '', stream_id: '', semester: '' };

export default function BatchesPage() {
  const [batches, setBatches] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
      semester: b.semester || '',
    });
    loadStreams(b.university_id);
    setDialogOpen(true);
  }

  function handleUniversityChange(v) {
    setForm({ ...form, university_id: v, stream_id: '' });
    loadStreams(v);
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Batches</CardTitle>
          <Button size="sm" onClick={openAdd}>Add New</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Stream</TableHead>
                <TableHead className={TH}>Semester</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No batches yet.</TableCell>
                </TableRow>
              )}
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{b.name}</TableCell>
                  <TableCell>{b.university_name || '—'}</TableCell>
                  <TableCell>{b.stream_name || '—'}</TableCell>
                  <TableCell>{b.semester || '—'}</TableCell>
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
              <Label>Stream</Label>
              <Select value={form.stream_id} onValueChange={(v) => setForm({ ...form, stream_id: v })} disabled={!form.university_id}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select stream (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Semester</Label>
              <Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="e.g. Semester 1" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !form.university_id}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
