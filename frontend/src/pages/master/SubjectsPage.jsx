import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/StatusBadge';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';

const emptyForm = { name: '', subject_code: '', university_id: '', stream_id: '' };
const emptyAssignment = { academic_year_id: '', semester_id: '' };
const emptyFilters = { search: '', university_id: '', stream_id: '', status: '', batch_id: '', academic_year_id: '', semester_id: '', assigned: '' };

export default function SubjectsPage() {
  const confirm = useConfirm();
  const [subjects, setSubjects] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [assignments, setAssignments] = useState([{ ...emptyAssignment }]);
  const [assignmentYears, setAssignmentYears] = useState({});
  const [assignmentSemesters, setAssignmentSemesters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);

  // Filter-bar cascade data
  const [filterStreams, setFilterStreams] = useState([]);
  const [filterBatches, setFilterBatches] = useState([]);
  const [filterYears, setFilterYears] = useState([]);
  const [filterSemesters, setFilterSemesters] = useState([]);

  // Client-side filter (search + status only — the rest go to the server)
  const filtered = useMemo(() => subjects.filter((s) => {
    if (filters.search && !`${s.name} ${s.subject_code || ''}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.status === 'active' && !s.is_active) return false;
    if (filters.status === 'inactive' && s.is_active) return false;
    return true;
  }), [subjects, filters.search, filters.status]);

  async function load(f = filters) {
    try {
      const q = new URLSearchParams({ include_inactive: 'true' });
      if (f.university_id)    q.set('university_id', f.university_id);
      if (f.stream_id)        q.set('stream_id', f.stream_id);
      if (f.batch_id)         q.set('batch_id', f.batch_id);
      if (f.academic_year_id) q.set('academic_year_id', f.academic_year_id);
      if (f.semester_id)      q.set('semester_id', f.semester_id);
      if (f.assigned)         q.set('assigned', f.assigned);

      const [subRes, uniRes] = await Promise.all([
        client.get(`/subjects?${q}`),
        client.get('/universities'),
      ]);
      setSubjects(subRes.data);
      setUniversities(uniRes.data);
    } catch {
      toast.error('Failed to load data.');
    }
  }

  useEffect(() => { load(); }, []);

  // ── Filter-bar cascade loaders ─────────────────────────────────────────────

  async function onFilterUniChange(v) {
    const next = { ...filters, university_id: v, stream_id: '', batch_id: '', academic_year_id: '', semester_id: '' };
    setFilters(next);
    setFilterStreams([]);
    setFilterBatches([]);
    setFilterYears([]);
    setFilterSemesters([]);
    if (v) {
      const res = await client.get(`/streams?university_id=${v}`);
      setFilterStreams(res.data);
    }
    load(next);
  }

  async function onFilterStreamChange(v) {
    const next = { ...filters, stream_id: v, batch_id: '', academic_year_id: '', semester_id: '' };
    setFilters(next);
    setFilterBatches([]);
    setFilterYears([]);
    setFilterSemesters([]);
    if (v) {
      // Academic years are stream-level now, so load them alongside batches.
      const [batchRes, yearRes] = await Promise.all([
        client.get(`/batches?stream_id=${v}`),
        client.get(`/academic-years?stream_id=${v}`),
      ]);
      setFilterBatches(batchRes.data);
      setFilterYears(yearRes.data);
    }
    load(next);
  }

  function onFilterBatchChange(v) {
    const next = { ...filters, batch_id: v };
    setFilters(next);
    load(next);
  }

  async function onFilterYearChange(v) {
    const next = { ...filters, academic_year_id: v, semester_id: '' };
    setFilters(next);
    setFilterSemesters([]);
    if (v) {
      const res = await client.get(`/semesters?academic_year_id=${v}`);
      setFilterSemesters(res.data);
    }
    load(next);
  }

  function onFilterSemesterChange(v) {
    const next = { ...filters, semester_id: v };
    setFilters(next);
    load(next);
  }

  function onFilterAssignedChange(v) {
    const next = { ...filters, assigned: v };
    setFilters(next);
    load(next);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setFilterStreams([]);
    setFilterBatches([]);
    setFilterYears([]);
    setFilterSemesters([]);
    load(emptyFilters);
  }

  async function loadStreams(universityId) {
    if (!universityId) { setStreams([]); return; }
    try {
      const res = await client.get(`/streams?university_id=${universityId}`);
      setStreams(res.data);
    } catch { setStreams([]); }
  }

  // Academic years belong to the stream now, so the whole assignment builder
  // shares one year list keyed at [0].
  async function loadYearsForStream(streamId) {
    if (!streamId) {
      setAssignmentYears({});
      setAssignmentSemesters([]);
      return;
    }
    try {
      const res = await client.get(`/academic-years?stream_id=${streamId}`);
      setAssignmentYears({ 0: res.data });
    } catch {
      setAssignmentYears({});
    }
  }

  async function loadSemestersForYear(yearId) {
    if (!yearId) { setAssignmentSemesters([]); return; }
    try {
      const res = await client.get(`/semesters?academic_year_id=${yearId}`);
      setAssignmentSemesters(res.data);
    } catch { setAssignmentSemesters([]); }
  }

  function handleUniversityChange(v) {
    setForm({ ...form, university_id: v, stream_id: '' });
    setAssignments([{ ...emptyAssignment }]);
    setAssignmentYears({});
    loadStreams(v);
  }

  function handleStreamChange(v) {
    setForm({ ...form, stream_id: v });
    setAssignments([{ ...emptyAssignment }]);
    setAssignmentSemesters([]);
    loadYearsForStream(v);
  }

  function updateAssignment(index, field, value) {
    const next = assignments.map((a, i) => i === index ? { ...a, [field]: value } : a);
    if (field === 'academic_year_id') {
      next[index].semester_id = '';
      loadSemestersForYear(value);
    }
    setAssignments(next);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setStreams([]);
    setAssignments([{ ...emptyAssignment }]);
    setAssignmentYears({});
    setAssignmentSemesters([]);
    setDialogOpen(true);
  }

  async function openEdit(s) {
    setEditing(s);
    setForm({
      name: s.name,
      subject_code: s.subject_code || '',
      university_id: String(s.university_id),
      stream_id: s.stream_id ? String(s.stream_id) : '',
    });
    await loadStreams(s.university_id);

    try {
      const res = await client.get(`/academic-year-subjects?subject_id=${s.id}`);
      const first = res.data[0];
      if (!first) {
        setAssignments([{ ...emptyAssignment }]);
        setAssignmentYears({});
        setAssignmentSemesters([]);
      } else {
        const row = {
          academic_year_id: String(first.academic_year_id),
          semester_id: first.semester_id ? String(first.semester_id) : '',
        };
        setAssignments([row]);
        const [yr, sem] = await Promise.all([
          client.get(`/academic-years?stream_id=${s.stream_id}`),
          client.get(`/semesters?academic_year_id=${first.academic_year_id}`),
        ]);
        setAssignmentYears({ 0: yr.data });
        setAssignmentSemesters(sem.data);
      }
    } catch {
      setAssignments([{ ...emptyAssignment }]);
      setAssignmentYears({});
    }
    setDialogOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validAssignments = assignments.filter((a) => a.academic_year_id);
    if (validAssignments.length === 0) {
      toast.error('At least one Academic Year assignment is required.');
      return;
    }
    if (assignmentSemesters.length > 0 && !assignments[0].semester_id) {
      toast.error('This year uses semesters — please select a semester.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, assignments: validAssignments };
      if (editing) {
        await client.put(`/subjects/${editing.id}`, payload);
        toast.success('Subject updated.');
      } else {
        await client.post('/subjects', payload);
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
    const ok = await confirm({
      title: 'Deactivate subject?',
      description: `Are you sure you want to deactivate "${s.name}"?`,
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
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
        <CardContent className="pt-4 space-y-3">
          {/* Row 1: subject fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input placeholder="Name or code" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>University</Label>
              <Select value={filters.university_id} onValueChange={onFilterUniChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stream</Label>
              <Select value={filters.stream_id} onValueChange={onFilterStreamChange} disabled={!filters.university_id || filterStreams.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {filterStreams.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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

          {/* Row 2: curriculum assignment filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Batch</Label>
              <Select value={filters.batch_id} onValueChange={onFilterBatchChange} disabled={!filters.stream_id || filterBatches.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {filterBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Academic Year</Label>
              <Select value={filters.academic_year_id} onValueChange={onFilterYearChange} disabled={!filters.batch_id || filterYears.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {filterYears.map((y) => <SelectItem key={y.id} value={String(y.id)}>{y.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Semester</Label>
              <Select value={filters.semester_id} onValueChange={onFilterSemesterChange} disabled={!filters.academic_year_id || filterSemesters.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {filterSemesters.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Assignment</Label>
              <Select value={filters.assigned} onValueChange={onFilterAssignedChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Assigned to curriculum</SelectItem>
                  <SelectItem value="false">Not assigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex">
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Subjects ({filtered.length})</CardTitle>
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
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
                    {subjects.length === 0 ? 'No subjects yet.' : 'No subjects match your filters.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{s.name}</TableCell>
                  <TableCell>{s.subject_code || '—'}</TableCell>
                  <TableCell>{s.university_name || '—'}</TableCell>
                  <TableCell>{s.stream_name || '—'}</TableCell>
                  <TableCell><StatusBadge status={s.is_active ? 'active' : 'inactive'} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                    {s.is_active
                      ? <Button size="sm" variant="outline" onClick={() => handleDeactivate(s)}>Deactivate</Button>
                      : <Button size="sm" variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700" onClick={() => handleActivate(s)}>Activate</Button>
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} placeholder="e.g. BCOM101" />
            </div>
            <div className="space-y-1">
              <Label>University *</Label>
              <Select value={form.university_id} onValueChange={handleUniversityChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select university" /></SelectTrigger>
                <SelectContent>
                  {universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stream *</Label>
              <Select value={form.stream_id} onValueChange={handleStreamChange} disabled={!form.university_id}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select stream" /></SelectTrigger>
                <SelectContent>
                  {streams.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Assign to Academic Year *
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pick the stream's academic year this subject is taught in. Every batch of the stream inherits it.
              </p>

              <div className="flex-1">
                <Select
                  value={assignments[0].academic_year_id}
                  onValueChange={(v) => updateAssignment(0, 'academic_year_id', v)}
                  disabled={!form.stream_id}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Academic Year" /></SelectTrigger>
                  <SelectContent>
                    {(assignmentYears[0] || []).map((y) => (
                      <SelectItem key={y.id} value={String(y.id)}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {assignmentSemesters.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Semester * <span className="font-normal">(this year uses semesters)</span></Label>
                  <Select
                    value={assignments[0].semester_id}
                    onValueChange={(v) => updateAssignment(0, 'semester_id', v)}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select semester" /></SelectTrigger>
                    <SelectContent>
                      {assignmentSemesters.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
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
