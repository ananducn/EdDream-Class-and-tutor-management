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

const emptyForm = { name: '', subject_code: '', university_id: '', stream_id: '', semester: '' };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [subRes, uniRes] = await Promise.all([
        client.get('/subjects?include_inactive=true'),
        client.get('/universities'),
      ]);
      setSubjects(subRes.data);
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

  function openEdit(s) {
    setEditing(s);
    setForm({
      name: s.name,
      subject_code: s.subject_code || '',
      university_id: String(s.university_id),
      stream_id: s.stream_id ? String(s.stream_id) : '',
      semester: s.semester || '',
    });
    loadStreams(s.university_id);
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
        await client.put(`/subjects/${editing.id}`, form);
        toast.success('Subject updated.');
      } else {
        await client.post('/subjects', form);
        toast.success('Subject created.');
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
      await client.delete(`/subjects/${s.id}`);
      toast.success(`${s.name} deactivated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate.');
    }
  }

  async function handleActivate(s) {
    try {
      await client.patch(`/subjects/${s.id}/activate`);
      toast.success(`${s.name} activated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate.');
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Subjects</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Subjects</CardTitle>
          <Button size="sm" onClick={openAdd}>Add New</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>Code</TableHead>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Stream</TableHead>
                <TableHead className={TH}>Semester</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No subjects yet.</TableCell>
                </TableRow>
              )}
              {subjects.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{s.name}</TableCell>
                  <TableCell>{s.subject_code || '—'}</TableCell>
                  <TableCell>{s.university_name || '—'}</TableCell>
                  <TableCell>{s.stream_name || '—'}</TableCell>
                  <TableCell>{s.semester || '—'}</TableCell>
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
            <DialogTitle>{editing ? 'Edit Subject' : 'Add Subject'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Subject Code</Label>
              <Input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} placeholder="e.g. CS101" />
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
              <Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="e.g. Semester 3" />
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
