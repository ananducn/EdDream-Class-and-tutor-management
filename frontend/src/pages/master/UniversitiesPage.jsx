import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';
import { SkeletonTable } from '@/components/Skeletons';

const emptyForm = { name: '', short_code: '' };

export default function UniversitiesPage() {
  const confirm = useConfirm();
  const [universities, setUniversities] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await client.get('/universities?include_inactive=true');
      setUniversities(res.data);
    } catch {
      toast.error('Failed to load universities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, short_code: u.short_code || '' });
    setDialogOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await client.put(`/universities/${editing.id}`, form);
        toast.success('University updated.');
      } else {
        await client.post('/universities', form);
        toast.success('University created.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(u) {
    const ok = await confirm({
      title: 'Deactivate university?',
      description: `Are you sure you want to deactivate "${u.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/universities/${u.id}`);
      toast.success(`${u.name} deactivated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate.');
    }
  }

  async function handleActivate(u) {
    try {
      await client.patch(`/universities/${u.id}/activate`);
      toast.success(`${u.name} activated.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate.');
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Universities</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Universities</CardTitle>
          <Button size="sm" onClick={openAdd}>Add New</Button>
        </CardHeader>
        <CardContent>
          {loading ? <SkeletonTable rows={5} cols={4} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>Short Code</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {universities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No universities yet.</TableCell>
                </TableRow>
              )}
              {universities.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{u.name}</TableCell>
                  <TableCell>{u.short_code || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={u.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Button>
                    {u.is_active ? (
                      <Button size="sm" variant="outline" onClick={() => handleDeactivate(u)}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900" onClick={() => handleActivate(u)}>Activate</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit University' : 'Add University'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Short Code *</Label>
              <Input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} placeholder="e.g. MU" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
