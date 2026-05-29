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

const emptyForm = {
  name: '', email: '', phone: '', payment_type: '', hourly_rate: '',
  subject_ids: [], university_ids: [], batch_ids: [],
};

function CheckboxGroup({ label, items, selected, onChange }) {
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1 bg-white dark:bg-slate-900">
        {items.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 p-1">None available</p>}
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 py-0.5 text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => toggle(item.id)}
              className="rounded"
            />
            {item.name}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FacultyPage() {
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [batches, setBatches] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [fRes, sRes, uRes, bRes] = await Promise.all([
        client.get('/faculty'),
        client.get('/subjects'),
        client.get('/universities'),
        client.get('/batches'),
      ]);
      setFaculty(fRes.data);
      setSubjects(sRes.data);
      setUniversities(uRes.data);
      setBatches(bRes.data);
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

  function openEdit(f) {
    setEditing(f);
    setForm({
      name: f.name,
      email: f.email || '',
      phone: f.phone || '',
      payment_type: f.payment_type || '',
      hourly_rate: f.hourly_rate || '',
      subject_ids: f.subjects.map((s) => s.id),
      university_ids: f.universities.map((u) => u.id),
      batch_ids: f.batches.map((b) => b.id),
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      };
      if (editing) {
        await client.put(`/faculty/${editing.id}`, payload);
        toast.success('Faculty updated.');
      } else {
        await client.post('/faculty', payload);
        toast.success('Faculty created.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeactivate(f) {
    setDeactivateTarget(f);
    setConfirmOpen(true);
  }

  async function handleDeactivate() {
    try {
      await client.delete(`/faculty/${deactivateTarget.id}`);
      toast.success(`${deactivateTarget.name} deactivated.`);
      setConfirmOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate.');
    }
  }

  async function handleActivate(f) {
    try {
      await client.patch(`/faculty/${f.id}/activate`);
      toast.success(`${f.name} activated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate.');
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Faculty</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Faculty</CardTitle>
          <Button size="sm" onClick={openAdd}>Add Faculty</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>Email</TableHead>
                <TableHead className={TH}>Phone</TableHead>
                <TableHead className={TH}>Payment Type</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faculty.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No faculty yet.</TableCell>
                </TableRow>
              )}
              {faculty.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{f.name}</TableCell>
                  <TableCell>{f.email || '—'}</TableCell>
                  <TableCell>{f.phone || '—'}</TableCell>
                  <TableCell className="capitalize">{f.payment_type || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={f.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(f)}>Edit</Button>
                    {f.is_active ? (
                      <Button size="sm" variant="outline" onClick={() => confirmDeactivate(f)}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900" onClick={() => handleActivate(f)}>Activate</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Faculty' : 'Add Faculty'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Payment Type</Label>
                <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.payment_type === 'hourly' && (
                <div className="space-y-1">
                  <Label>Hourly Rate (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
                </div>
              )}
            </div>

            <CheckboxGroup
              label="Subjects"
              items={subjects}
              selected={form.subject_ids}
              onChange={(ids) => setForm({ ...form, subject_ids: ids })}
            />
            <CheckboxGroup
              label="Universities"
              items={universities}
              selected={form.university_ids}
              onChange={(ids) => setForm({ ...form, university_ids: ids })}
            />
            <CheckboxGroup
              label="Batches"
              items={batches}
              selected={form.batch_ids}
              onChange={(ids) => setForm({ ...form, batch_ids: ids })}
            />

            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Faculty</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Are you sure you want to deactivate <strong className="text-slate-900 dark:text-slate-100">{deactivateTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
