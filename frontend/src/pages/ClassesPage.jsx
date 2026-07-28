import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import StatusBadge from '@/components/StatusBadge';
import { SkeletonTable } from '@/components/Skeletons';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import { to12h } from '@/lib/time';
import { takenLockReason } from '@/lib/editWindow';
import LockedBadge, { LockHint } from '@/components/LockedBadge';
import { defaultDateRange, describeDateRange } from '@/lib/dateRange';

const emptyForm = {
  date: '', start_time: '', end_time: '', total_hours: '',
  faculty_id: '', subject_id: '', university_id: '', stream_id: '', batch_id: '',
  academic_year_id: '', semester_id: '', chapter_id: '',
  class_status: 'scheduled',
  unit_chapter: '', class_mode: '', platform_used: '', notes: '',
};

const emptyFilters = {
  date_from: '', date_to: '', faculty_id: '', subject_id: '', university_id: '',
  batch_id: '', class_mode: '', class_status: '',
};

function calcHours(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  return (mins / 60).toFixed(2);
}

export default function ClassesPage() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [formBatches, setFormBatches] = useState([]);
  const [formStreams, setFormStreams] = useState([]);
  const [formAcademicYears, setFormAcademicYears] = useState([]);
  const [formSemesters, setFormSemesters] = useState([]);
  const [formAcademicYearSubjects, setFormAcademicYearSubjects] = useState([]);
  const [formChapters, setFormChapters] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  // The date range actually loaded, shown under the filters.
  const [appliedRange, setAppliedRange] = useState({ from: '', to: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Common-subject fan-out: schedule one class across many batches from the
  // streams the (shared) subject is linked to. commonStreams holds those streams;
  // selectedBatchIds is the multi-batch selection.
  const [commonSubject, setCommonSubject] = useState(false);
  const [commonStreams, setCommonStreams] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadDropdowns() {
    const [fRes, sRes, uRes, bRes, stRes] = await Promise.all([
      client.get('/faculty'),
      client.get('/subjects'),
      client.get('/universities'),
      client.get('/batches'),
      client.get('/streams'),
    ]);
    setFaculty(fRes.data);
    setSubjects(sRes.data);
    setUniversities(uRes.data);
    setBatches(bRes.data);
    setStreams(stRes.data);
    setFilteredBatches(bRes.data);
    setFormBatches(bRes.data);
    setFormStreams(stRes.data);
  }

  async function loadClasses(params = filters) {
    setLoading(true);
    // Remember what was actually fetched so the summary line can't drift from it.
    setAppliedRange({ from: params.date_from || '', to: params.date_to || '' });
    try {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== '') query.set(k, v); });
      const res = await client.get(`/classes?${query}`);
      setClasses(res.data);
    } catch {
      toast.error('Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDropdowns();
    // Default to the last three months; a ?date_from=/?date_to= in the URL still wins.
    const initialFilters = { ...emptyFilters, ...defaultDateRange() };
    searchParams.forEach((v, k) => { if (k in initialFilters) initialFilters[k] = v; });
    setFilters(initialFilters);
    loadClasses(initialFilters);
  }, []);

  function handleFilterUniChange(v) {
    setFilters({ ...filters, university_id: v, batch_id: '' });
    setFilteredBatches(v ? batches.filter((b) => String(b.university_id) === v) : batches);
  }

  function handleFormUniChange(v) {
    setForm({ ...form, university_id: v, stream_id: '', batch_id: '', academic_year_id: '', semester_id: '', subject_id: '', chapter_id: '' });
    setFormStreams(v ? streams.filter((s) => String(s.university_id) === v) : streams);
    setFormBatches(v ? batches.filter((b) => String(b.university_id) === v) : batches);
    setFormAcademicYears([]); setFormSemesters([]); setFormAcademicYearSubjects([]); setFormChapters([]);
  }

  // The syllabus (years → chapters) belongs to the STREAM now, so the curriculum
  // cascade hangs off the stream. Batch is chosen separately as the cohort.
  async function handleFormStreamChange(v) {
    setForm({ ...form, stream_id: v, batch_id: '', academic_year_id: '', semester_id: '', subject_id: '', chapter_id: '' });
    setFormBatches(v ? batches.filter((b) => String(b.stream_id) === v) : batches.filter((b) => String(b.university_id) === form.university_id));
    setFormAcademicYears([]); setFormSemesters([]); setFormAcademicYearSubjects([]); setFormChapters([]);
    if (v) {
      try { const res = await client.get(`/academic-years?stream_id=${v}`); setFormAcademicYears(res.data); } catch { /**/ }
    }
  }

  function handleFormBatchChange(v) {
    setForm((f) => ({ ...f, batch_id: v }));
  }

  async function handleFormYearChange(v) {
    setForm((f) => ({ ...f, academic_year_id: v, semester_id: '', subject_id: '', chapter_id: '' }));
    setFormSemesters([]); setFormAcademicYearSubjects([]); setFormChapters([]);
    if (v) {
      try {
        const [semRes, subRes] = await Promise.all([
          client.get(`/semesters?academic_year_id=${v}`),
          client.get(`/academic-year-subjects?academic_year_id=${v}`),
        ]);
        setFormSemesters(semRes.data);
        if (semRes.data.length === 0) setFormAcademicYearSubjects(subRes.data);
      } catch { /**/ }
    }
  }

  async function handleFormSemesterChange(v) {
    setForm((f) => ({ ...f, semester_id: v, subject_id: '', chapter_id: '' }));
    setFormAcademicYearSubjects([]); setFormChapters([]);
    if (v) {
      try { const res = await client.get(`/academic-year-subjects?semester_id=${v}`); setFormAcademicYearSubjects(res.data); } catch { /**/ }
    }
  }

  async function handleFormSubjectChange(subjectId) {
    setForm((f) => ({ ...f, subject_id: subjectId, chapter_id: '' }));
    setFormChapters([]);
    if (!subjectId) { setCommonStreams([]); setSelectedBatchIds([]); return;  }
    const ays = formAcademicYearSubjects.find((s) => String(s.subject_id) === subjectId);
    if (ays) {
      try { const res = await client.get(`/chapters?academic_year_subject_id=${ays.id}`); setFormChapters(res.data); } catch { /**/ }
    }
    // For a common-subject fan-out, discover every stream (same university) the
    // subject is linked to so we can offer their batches.
    if (commonSubject) {
      setSelectedBatchIds([]);
      await loadCommonStreams(subjectId);
    }
  }

  // Streams (same university) the given subject is linked to, for the fan-out.
  async function loadCommonStreams(subjectId) {
    if (!subjectId) { setCommonStreams([]); return; }
    try {
      const res = await client.get(`/academic-year-subjects?subject_id=${subjectId}`);
      const seen = new Set();
      const streamsForSubject = [];
      for (const p of res.data) {
        if (String(p.university_id) !== String(form.university_id)) continue;
        if (seen.has(String(p.stream_id))) continue;
        seen.add(String(p.stream_id));
        streamsForSubject.push({ stream_id: p.stream_id, stream_name: p.stream_name });
      }
      setCommonStreams(streamsForSubject);
    } catch { /**/ }
  }

  function handleFormChapterChange(v) {
    setForm((f) => ({ ...f, chapter_id: v }));
  }

  async function handleCommonToggle(v) {
    setCommonSubject(v);
    setCommonStreams([]);
    setSelectedBatchIds([]);
    setForm((f) => ({ ...f, batch_id: '' }));
    // If a subject is already chosen, populate its linked streams right away.
    if (v && form.subject_id) await loadCommonStreams(form.subject_id);
  }

  function toggleBatchSelection(id) {
    const s = String(id);
    setSelectedBatchIds((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function handleTimeChange(field, value) {
    const updated = { ...form, [field]: value };
    updated.total_hours = calcHours(
      field === 'start_time' ? value : form.start_time,
      field === 'end_time' ? value : form.end_time,
    );
    setForm(updated);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setCommonSubject(false); setCommonStreams([]); setSelectedBatchIds([]);
    setFormStreams(streams);
    setFormBatches(batches);
    setFormAcademicYears([]); setFormSemesters([]); setFormAcademicYearSubjects([]); setFormChapters([]);
    setFormOpen(true);
  }

  async function openEdit(c) {
    setEditing(c);
    // Editing applies to the shared fields; batch composition isn't re-picked here.
    setCommonSubject(false); setCommonStreams([]); setSelectedBatchIds([]);
    setForm({
      date: c.date?.slice(0, 10) || '',
      start_time: c.start_time || '',
      end_time: c.end_time || '',
      total_hours: c.total_hours || '',
      faculty_id: c.faculty_id ? String(c.faculty_id) : '',
      subject_id: c.subject_id ? String(c.subject_id) : '',
      university_id: c.university_id ? String(c.university_id) : '',
      stream_id: c.stream_id ? String(c.stream_id) : '',
      batch_id: c.batch_id ? String(c.batch_id) : '',
      academic_year_id: c.academic_year_id ? String(c.academic_year_id) : '',
      semester_id: c.semester_id ? String(c.semester_id) : '',
      chapter_id: c.chapter_id ? String(c.chapter_id) : '',
      class_status: c.class_status || 'scheduled',
      unit_chapter: c.unit_chapter || '',
      class_mode: c.class_mode || '',
      platform_used: c.platform_used || '',
      notes: c.notes || '',
    });

    setFormStreams(c.university_id ? streams.filter((s) => String(s.university_id) === String(c.university_id)) : streams);
    setFormBatches(
      c.stream_id ? batches.filter((b) => String(b.stream_id) === String(c.stream_id))
      : c.university_id ? batches.filter((b) => String(b.university_id) === String(c.university_id))
      : batches
    );
    setFormAcademicYears([]); setFormSemesters([]); setFormAcademicYearSubjects([]); setFormChapters([]);

    if (c.stream_id) {
      try {
        const ayRes = await client.get(`/academic-years?stream_id=${c.stream_id}`);
        setFormAcademicYears(ayRes.data);

        if (c.academic_year_id) {
          const [semRes, subRes] = await Promise.all([
            client.get(`/semesters?academic_year_id=${c.academic_year_id}`),
            c.semester_id
              ? client.get(`/academic-year-subjects?semester_id=${c.semester_id}`)
              : client.get(`/academic-year-subjects?academic_year_id=${c.academic_year_id}`),
          ]);
          setFormSemesters(semRes.data);
          setFormAcademicYearSubjects(subRes.data);

          if (c.subject_id) {
            const ays = subRes.data.find((s) => String(s.subject_id) === String(c.subject_id));
            if (ays) {
              const chapRes = await client.get(`/chapters?academic_year_subject_id=${ays.id}`);
              setFormChapters(chapRes.data);
            }
          }
        }
      } catch { /**/ }
    }

    setFormOpen(true);
  }

  async function quickSetStatus(c, status) {
    try {
      await client.put(`/classes/${c.id}`, { ...c, date: c.date?.slice(0, 10), class_status: status });
      toast.success('Status updated.');
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Native `required` covers the <input> fields; the Radix <Select>s need a
    // manual check since they don't participate in HTML form validation.
    const isFanOut = commonSubject && !editing;
    const requiredSelects = [
      ['faculty_id', 'Faculty'],
      ['university_id', 'University'],
      ['stream_id', 'Stream'],
      ...(isFanOut ? [] : [['batch_id', 'Batch']]),
      ['academic_year_id', 'Academic Year'],
      ['subject_id', 'Subject'],
      ['chapter_id', 'Chapter'],
      ['class_mode', 'Class Mode'],
    ];
    const missing = requiredSelects.filter(([key]) => !form[key]).map(([, label]) => label);
    if (formSemesters.length > 0 && !form.semester_id) missing.push('Semester');
    if (isFanOut && selectedBatchIds.length === 0) missing.push('at least one Batch');
    if (missing.length) {
      toast.error(`Please select: ${missing.join(', ')}.`);
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await client.put(`/classes/${editing.id}`, payload);
        toast.success('Class updated.');
      } else if (isFanOut) {
        // Fan out one common-subject class across the selected batches. The backend
        // resolves each batch's own stream and groups the rows into one class.
        await client.post('/classes', { ...payload, batch_id: '', batch_ids: selectedBatchIds });
        toast.success(`Class added for ${selectedBatchIds.length} batch${selectedBatchIds.length > 1 ? 'es' : ''}.`);
      } else {
        await client.post('/classes', payload);
        toast.success('Class added.');
      }
      setFormOpen(false);
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await client.delete(`/classes/${deleteTarget.id}`);
      toast.success('Class deleted.');
      setDeleteTarget(null);
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete class.');
    } finally {
      setDeleting(false);
    }
  }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  // Collapse fanned-out (common-subject) classes into a single representative row.
  const groupSize = {};
  for (const c of classes) if (c.class_group_id) groupSize[c.class_group_id] = (groupSize[c.class_group_id] || 0) + 1;
  const seenGroups = new Set();
  const displayClasses = classes.filter((c) => {
    if (!c.class_group_id) return true;
    if (seenGroups.has(c.class_group_id)) return false;
    seenGroups.add(c.class_group_id);
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Classes</h1>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Date From</Label>
              <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Date To</Label>
              <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Faculty</Label>
              <Select value={filters.faculty_id} onValueChange={(v) => setFilters({ ...filters, faculty_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>University</Label>
              <Select value={filters.university_id} onValueChange={handleFilterUniChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Batch</Label>
              <Select value={filters.batch_id} onValueChange={(v) => setFilters({ ...filters, batch_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {filteredBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Select value={filters.subject_id} onValueChange={(v) => setFilters({ ...filters, subject_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={filters.class_mode} onValueChange={(v) => setFilters({ ...filters, class_mode: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={filters.class_status} onValueChange={(v) => setFilters({ ...filters, class_status: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="taken">Taken</SelectItem>
                  <SelectItem value="not_taken">Not Taken</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {describeDateRange(appliedRange.from, appliedRange.to)} Change the dates to see other periods.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => loadClasses()} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
            <Button size="sm" variant="outline" onClick={() => {
              // Clear returns to the default window, not to an unbounded "everything".
              const cleared = { ...emptyFilters, ...defaultDateRange() };
              setFilters(cleared); setFilteredBatches(batches); loadClasses(cleared);
            }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Classes ({classes.length})</CardTitle>
          <Button size="sm" onClick={openAdd}>Add Class</Button>
        </CardHeader>
        <CardContent>
          {loading ? <SkeletonTable rows={6} cols={9} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Date</TableHead>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={TH}>Subject</TableHead>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Batch</TableHead>
                <TableHead className={TH}>Hours</TableHead>
                <TableHead className={TH}>Mode</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No classes found.</TableCell>
                </TableRow>
              )}
              {displayClasses.map((c) => (
                <TableRow
                  key={c.id}
                  className={c.class_status === 'taken' ? 'bg-green-100 hover:bg-green-200/70 dark:bg-green-900/30 dark:hover:bg-green-900/40' : ''}
                >
                  <TableCell className="text-slate-900 dark:text-slate-100">{c.date?.slice(0, 10)}</TableCell>
                  <TableCell>{c.faculty_name || '—'}</TableCell>
                  <TableCell>{c.subject_name || '—'}</TableCell>
                  <TableCell>{c.university_name || '—'}</TableCell>
                  <TableCell>
                    {c.class_group_id
                      ? <span title="Common-subject class across multiple batches">{c.batch_name || '—'} <span className="text-xs text-slate-400">+{(groupSize[c.class_group_id] || 1) - 1} more</span></span>
                      : (c.batch_name || '—')}
                  </TableCell>
                  <TableCell>{c.total_hours || '—'}</TableCell>
                  <TableCell>
                    {c.class_mode ? <StatusBadge status={c.class_mode} /> : '—'}
                  </TableCell>
                  <TableCell>
                    {takenLockReason(c.class_status, c.date, isAdmin()) && (
                      <div className="mb-1"><LockedBadge reason={takenLockReason(c.class_status, c.date, isAdmin())} /></div>
                    )}
                    <LockHint reason={takenLockReason(c.class_status, c.date, isAdmin())}>
                    <Select
                      value={c.class_status || 'scheduled'}
                      onValueChange={(v) => quickSetStatus(c, v)}
                      disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="taken">Taken</SelectItem>
                        <SelectItem value="not_taken">Not Taken</SelectItem>
                      </SelectContent>
                    </Select>
                    </LockHint>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setViewDialog(c)}>View</Button>
                    <LockHint reason={takenLockReason(c.class_status, c.date, isAdmin())}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(c)}
                        disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                      >Edit</Button>
                    </LockHint>
                    {isAdmin() && (
                      <LockHint reason={takenLockReason(c.class_status, c.date, isAdmin())}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900"
                          onClick={() => setDeleteTarget(c)}
                          disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                        >
                          Delete
                        </Button>
                      </LockHint>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Class Details</DialogTitle></DialogHeader>
          {viewDialog && (() => {
            // For a common-subject (grouped) class, the per-batch stream/year/semester
            // vary, so list them in a table instead of single lines.
            const groupRows = viewDialog.class_group_id
              ? classes.filter((c) => String(c.class_group_id) === String(viewDialog.class_group_id))
              : null;
            const shared = [
              ['Date', viewDialog.date?.slice(0, 10)],
              ['Faculty', viewDialog.faculty_name],
              ['Subject', viewDialog.subject_name],
              ['University', viewDialog.university_name],
              ...(groupRows ? [] : [
                ['Stream', viewDialog.stream_name],
                ['Batch', viewDialog.batch_name],
                ['Academic Year', viewDialog.academic_year_name],
                ['Semester', viewDialog.semester_name],
              ]),
              ['Status', viewDialog.class_status],
              ['Start Time', to12h(viewDialog.start_time)],
              ['End Time', to12h(viewDialog.end_time)],
              ['Total Hours', viewDialog.total_hours],
              ['Mode', viewDialog.class_mode],
              ['Platform', viewDialog.platform_used],
              ['Unit/Chapter', viewDialog.unit_chapter],
              ['Notes', viewDialog.notes],
            ];
            return (
              <div className="space-y-3 text-sm">
                <div className="space-y-2">
                  {shared.map(([label, val]) => val !== null && val !== undefined && val !== '' && (
                    <div key={label} className="flex gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300 w-32 shrink-0">{label}:</span>
                      <span className="text-slate-500 dark:text-slate-400">{String(val)}</span>
                    </div>
                  ))}
                </div>

                {groupRows && (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-700 dark:text-slate-300">Scheduled for {groupRows.length} batch{groupRows.length > 1 ? 'es' : ''}:</p>
                    <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Stream</TableHead>
                            <TableHead className="text-xs">Batch</TableHead>
                            <TableHead className="text-xs">Year</TableHead>
                            <TableHead className="text-xs">Semester</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupRows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs">{r.stream_name || '—'}</TableCell>
                              <TableCell className="text-xs">{r.batch_name || '—'}</TableCell>
                              <TableCell className="text-xs">{r.academic_year_name || '—'}</TableCell>
                              <TableCell className="text-xs">{r.semester_name || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete Class</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to delete the class
            {deleteTarget?.subject_name ? ` "${deleteTarget.subject_name}"` : ''}
            {deleteTarget?.date ? ` on ${deleteTarget.date.slice(0, 10)}` : ''}? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Class' : 'Add Class'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-5 pb-2">

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Class Details</p>
              <div className="grid grid-cols-2 gap-3">
                {!editing && (
                  <div className="col-span-2 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <div>
                      <Label className="mb-0">Common subject</Label>
                      <p className="text-xs text-slate-400">Schedule this class for multiple batches across the streams sharing this subject.</p>
                    </div>
                    <Switch checked={commonSubject} onCheckedChange={handleCommonToggle} />
                  </div>
                )}
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Start Time *</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => handleTimeChange('start_time', e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>End Time *</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => handleTimeChange('end_time', e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Total Hours *</Label>
                  <Input type="number" min="0" step="0.01" value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Faculty *</Label>
                  <Select value={form.faculty_id} onValueChange={(v) => setForm({ ...form, faculty_id: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>University *</Label>
                  <Select value={form.university_id} onValueChange={handleFormUniChange}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Stream *</Label>
                  <Select value={form.stream_id} onValueChange={handleFormStreamChange} disabled={!form.university_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formStreams.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {!(commonSubject && !editing) && (
                  <div className="space-y-1">
                    <Label>Batch *</Label>
                    <Select value={form.batch_id} onValueChange={handleFormBatchChange} disabled={!form.stream_id}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{formBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Academic Year *</Label>
                  <Select value={form.academic_year_id} onValueChange={handleFormYearChange} disabled={!form.stream_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formAcademicYears.map((ay) => <SelectItem key={ay.id} value={String(ay.id)}>{ay.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {formSemesters.length > 0 && (
                  <div className="space-y-1">
                    <Label>Semester *</Label>
                    <Select value={form.semester_id} onValueChange={handleFormSemesterChange} disabled={!form.academic_year_id}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{formSemesters.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Subject *</Label>
                  <Select value={form.subject_id} onValueChange={handleFormSubjectChange} disabled={!form.academic_year_id || (formSemesters.length > 0 && !form.semester_id)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formAcademicYearSubjects.map((s) => <SelectItem key={s.subject_id} value={String(s.subject_id)}>{s.subject_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Chapter *</Label>
                  <Select value={form.chapter_id} onValueChange={handleFormChapterChange} disabled={!form.subject_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formChapters.map((ch) => <SelectItem key={ch.id} value={String(ch.id)}>{ch.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {commonSubject && !editing && (
                  <div className="space-y-2 col-span-2">
                    <Label>Batches * <span className="text-xs font-normal text-slate-400">({selectedBatchIds.length} selected)</span></Label>
                    {!form.subject_id ? (
                      <p className="text-xs text-slate-400">Pick a subject to see the batches of every stream that shares it.</p>
                    ) : commonStreams.length === 0 ? (
                      <p className="text-xs text-slate-400">This subject isn't linked to any stream in this university yet.</p>
                    ) : (
                      <div className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 max-h-56 overflow-y-auto">
                        {commonStreams.map((st) => {
                          const streamBatches = batches.filter((b) => String(b.stream_id) === String(st.stream_id));
                          return (
                            <div key={st.stream_id} className="space-y-1">
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{st.stream_name}</p>
                              {streamBatches.length === 0
                                ? <p className="text-xs text-slate-400 pl-1">No batches in this stream.</p>
                                : streamBatches.map((b) => (
                                    <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer pl-1">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={selectedBatchIds.includes(String(b.id))}
                                        onChange={() => toggleBatchSelection(b.id)}
                                      />
                                      {b.name}
                                    </label>
                                  ))
                              }
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Class Status</Label>
                  <Select value={form.class_status} onValueChange={(v) => setForm({ ...form, class_status: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="taken">Taken</SelectItem>
                      <SelectItem value="not_taken">Not Taken</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Class Mode *</Label>
                  <Select value={form.class_mode} onValueChange={(v) => setForm({ ...form, class_mode: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.class_mode === 'online' && (
                  <div className="space-y-1">
                    <Label>Platform Used</Label>
                    <Input value={form.platform_used} onChange={(e) => setForm({ ...form, platform_used: e.target.value })} placeholder="e.g. Zoom, Meet" />
                  </div>
                )}
                <div className="space-y-1 col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Class'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
