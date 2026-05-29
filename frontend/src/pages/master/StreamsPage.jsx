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

const emptyForm = { name: '', university_id: '', academic_year: '' };

export default function StreamsPage() {
  const [streams, setStreams] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [streamsRes, uniRes] = await Promise.all([
        client.get('/streams?include_inactive=true'),
        client.get('/universities'),
      ]);
      setStreams(streamsRes.data);
      setUniversities(uniRes.data);
    } catch {
      toast.error('Failed to load data.');
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(s) {
    setEditing(s);
    setForm({ name: s.name, university_id: String(s.university_id), academic_year: s.academic_year || '' });
    setDialogOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await client.put(`/streams/${editing.id}`, form);
        toast.success('Stream updated.');
      } else {
        await client.post('/streams', form);
        toast.success('Stream created.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(s) {
    try {
      await client.delete(`/streams/${s.id}`);
      toast.success(`${s.name} deactivated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate.');
    }
  }

  async function handleActivate(s) {
    try {
      await client.patch(`/streams/${s.id}/activate`);
      toast.success(`${s.name} activated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate.');
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Streams</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Streams</CardTitle>
          <Button size="sm" onClick={openAdd}>Add New</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Academic Year</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {streams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No streams yet.</TableCell>
                </TableRow>
              )}
              {streams.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{s.name}</TableCell>
                  <TableCell>{s.university_name || '—'}</TableCell>
                  <TableCell>{s.academic_year || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                    {s.is_active ? (
                      <Button size="sm" variant="outline" onClick={() => handleDeactivate(s)}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900" onClick={() => handleActivate(s)}>Activate</Button>
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
            <DialogTitle>{editing ? 'Edit Stream' : 'Add Stream'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>University *</Label>
              <Select value={form.university_id} onValueChange={(v) => setForm({ ...form, university_id: v })}>
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
              <Label>Academic Year</Label>
              <Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="e.g. 2024-25" />
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
