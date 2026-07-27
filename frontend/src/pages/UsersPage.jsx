import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/StatusBadge';
import client from '@/api/client';
import { SkeletonTable } from '@/components/Skeletons';

const EMPTY_INVITE = { name: '', email: '', role: 'staff' };
const EMPTY_EDIT = { name: '', email: '', role: 'staff' };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviteSaving, setInviteSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  async function loadUsers() {
    try {
      const res = await client.get('/users');
      setUsers(res.data);
    } catch {
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setInviteSaving(true);
    try {
      await client.post('/users/invite', inviteForm);
      toast.success(`Invite sent to ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm(EMPTY_INVITE);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite.');
    } finally {
      setInviteSaving(false);
    }
  }

  function openEdit(user) {
    setEditTarget(user);
    setEditForm({ name: user.name, email: user.email, role: user.role });
    setEditOpen(true);
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    try {
      const res = await client.put(`/users/${editTarget.id}`, editForm);
      setUsers((prev) => prev.map((u) => u.id === editTarget.id ? res.data : u));
      toast.success('User updated.');
      setEditOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user.');
    } finally {
      setEditSaving(false);
    }
  }

  function openReset(user) {
    setResetTarget(user);
    setResetPassword('');
    setResetOpen(true);
  }

  async function handleReset(e) {
    e.preventDefault();
    setResetSaving(true);
    try {
      await client.put(`/users/${resetTarget.id}/password`, { password: resetPassword });
      toast.success('Password updated.');
      setResetOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password.');
    } finally {
      setResetSaving(false);
    }
  }

  function openDelete(user) {
    setDeleteTarget(user);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    setDeleteSaving(true);
    try {
      await client.delete(`/users/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success('User deleted.');
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user.');
    } finally {
      setDeleteSaving(false);
    }
  }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Users</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">All Users</CardTitle>
          <Button size="sm" onClick={() => setInviteOpen(true)}>Invite User</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : !users.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Name</TableHead>
                  <TableHead className={TH}>Email</TableHead>
                  <TableHead className={TH}>Role</TableHead>
                  <TableHead className={TH}>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <StatusBadge status={user.role === 'admin' ? 'active' : 'inactive'} label={user.role === 'admin' ? 'Admin' : 'Staff'} />
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{formatDate(user.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openEdit(user)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => openReset(user)}>Reset Password</Button>
                        <Button
                          size="sm" variant="destructive"
                          disabled={currentUser?.id === user.id}
                          onClick={() => openDelete(user)}
                        >Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteSaving}>{inviteSaving ? 'Sending…' : 'Send Invite'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password — {resetTarget?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleReset} className="space-y-3">
            <div className="space-y-1">
              <Label>New Password</Label>
              <PasswordInput
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={resetSaving}>{resetSaving ? 'Saving…' : 'Update Password'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-100">{deleteTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSaving}>
              {deleteSaving ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
