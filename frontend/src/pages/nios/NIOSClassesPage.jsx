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
import { defaultDateRange, describeDateRange } from '@/lib/dateRange';

// Render helpers: derive subject / chapter labels from a class's chapters array
// (falls back to the legacy singular columns for pre-migration rows).
function subjectSummary(c) {
  const chs = Array.isArray(c?.chapters) ? c.chapters : [];
  if (!chs.length) return c?.subject_name || '';
  return [...new Set(chs.map((x) => x.subject_name).filter(Boolean))].join(', ');
}
function chapterSummary(c) {
  const chs = Array.isArray(c?.chapters) ? c.chapters : [];
  if (!chs.length) return c?.chapter_title || '';
  return chs.map((x) => x.chapter_title).filter(Boolean).join(', ');
}

const emptyForm = {
  date: '', start_time: '', end_time: '', total_hours: '',
  faculty_id: '',
  nios_university_id: '', nios_batch_id: '', nios_chapter_ids: [],
  class_status: 'scheduled',
  unit_chapter: '', class_mode: '', platform_used: '', notes: '',
};

const emptyFilters = {
  date_from: '', date_to: '', faculty_id: '', nios_university_id: '',
  year: '', nios_batch_id: '', nios_subject_id: '', class_mode: '',
  class_status: '',
};

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(2020 + i));

function calcHours(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  return (mins / 60).toFixed(2);
}

export default function NIOSClassesPage() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);

  // Filter-level cascade
  const [filterBatches, setFilterBatches] = useState([]);
  const [filterSubjects, setFilterSubjects] = useState([]);

  // Form-level cascade
  const [formBatches, setFormBatches] = useState([]);
  const [formBatchSubjects, setFormBatchSubjects] = useState([]); // [{id, nios_subject_id, subject_name}]
  const [chaptersBySubject, setChaptersBySubject] = useState({}); // { [subjectId]: [{id, title}] }
  const [pickerSubject, setPickerSubject] = useState(''); // which subject's chapters are shown

  const [filters, setFilters] = useState(emptyFilters);
  // The date range actually loaded, shown under the filters.
  const [appliedRange, setAppliedRange] = useState({ from: '', to: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Common-subject fan-out: schedule one class across many batches of the university.
  const [multiBatch, setMultiBatch] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadDropdowns() {
    const [fRes, uRes, bRes, sRes] = await Promise.all([
      client.get('/faculty'),
      client.get('/nios/universities'),
      client.get('/nios/batches'),
      client.get('/nios/subjects'),
    ]);
    setFaculty(fRes.data);
    setUniversities(uRes.data);
    setAllBatches(bRes.data);
    setAllSubjects(sRes.data);
    setFilterBatches(bRes.data);
    setFilterSubjects(sRes.data);
  }

  async function loadClasses(params = filters) {
    setLoading(true);
    // Remember what was actually fetched so the summary line can't drift from it.
    setAppliedRange({ from: params.date_from || '', to: params.date_to || '' });
    try {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== '') query.set(k, v); });
      const res = await client.get(`/nios/classes?${query}`);
      setClasses(res.data);
    } catch {
      toast.error('Failed to load NIOS classes.');
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

  // ── Filter cascade ──────────────────────────────────────────────────────────

  function handleFilterUniChange(v) {
    setFilters({ ...filters, nios_university_id: v, year: '', nios_batch_id: '', nios_subject_id: '' });
    setFilterBatches(v ? allBatches.filter((b) => String(b.nios_university_id) === v) : allBatches);
    setFilterSubjects(allSubjects);
  }

  function handleFilterYearChange(v) {
    setFilters({ ...filters, year: v, nios_batch_id: '', nios_subject_id: '' });
    const base = filters.nios_university_id
      ? allBatches.filter((b) => String(b.nios_university_id) === filters.nios_university_id)
      : allBatches;
    setFilterBatches(v ? base.filter((b) => b.year === v) : base);
    setFilterSubjects(allSubjects);
  }

  function handleFilterBatchChange(v) {
    // Subjects are university-level now, so the batch filter no longer narrows
    // the subject list.
    setFilters({ ...filters, nios_batch_id: v });
  }

  // ── Form cascade ──────────────────────────────────────────────────────────

  // The syllabus (subjects → chapters) belongs to the university now, so choosing
  // a university loads the subject list; the batch is just the cohort.
  async function handleFormUniChange(v) {
    setForm({ ...form, nios_university_id: v, nios_batch_id: '', nios_chapter_ids: [] });
    setFormBatches(v ? allBatches.filter((b) => String(b.nios_university_id) === v) : allBatches);
    setFormBatchSubjects([]);
    setChaptersBySubject({});
    setPickerSubject('');
    if (v) {
      try {
        const res = await client.get('/nios/university-subjects', { params: { nios_university_id: v } });
        setFormBatchSubjects(res.data);
      } catch { /**/ }
    }
  }

  function handleFormBatchChange(v) {
    setForm((f) => ({ ...f, nios_batch_id: v }));
  }

  function handleMultiBatchToggle(v) {
    setMultiBatch(v);
    setSelectedBatchIds([]);
    setForm((f) => ({ ...f, nios_batch_id: '' }));
  }

  function toggleBatchSelection(id) {
    const s = String(id);
    setSelectedBatchIds((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  // Load (once) and cache the chapters for a given subject in this university
  async function loadChaptersForSubject(subjectId, current) {
    const map = current || chaptersBySubject;
    if (!subjectId || map[subjectId]) return;
    const us = formBatchSubjects.find((s) => String(s.nios_subject_id) === String(subjectId));
    if (!us) return;
    try {
      const res = await client.get('/nios/chapters', { params: { nios_university_subject_id: us.id } });
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: res.data }));
    } catch { /**/ }
  }

  async function handlePickerSubjectChange(subjectId) {
    setPickerSubject(subjectId);
    await loadChaptersForSubject(subjectId);
  }

  function toggleChapter(chapterId) {
    const id = String(chapterId);
    const has = form.nios_chapter_ids.includes(id);
    setForm((f) => ({
      ...f,
      nios_chapter_ids: has ? f.nios_chapter_ids.filter((x) => x !== id) : [...f.nios_chapter_ids, id],
    }));
  }

  // Flat lookup of chapter id -> { title, subject_name } across loaded subjects
  function chapterLabel(id) {
    for (const [subjectId, chs] of Object.entries(chaptersBySubject)) {
      const ch = chs.find((c) => String(c.id) === String(id));
      if (ch) {
        const subj = formBatchSubjects.find((s) => String(s.nios_subject_id) === String(subjectId));
        return { title: ch.title, subject_name: subj?.subject_name || '' };
      }
    }
    return { title: `#${id}`, subject_name: '' };
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
    setMultiBatch(false); setSelectedBatchIds([]);
    setFormBatches(allBatches);
    setFormBatchSubjects([]);
    setChaptersBySubject({});
    setPickerSubject('');
    setFormOpen(true);
  }

  async function openEdit(c) {
    setEditing(c);
    setMultiBatch(false); setSelectedBatchIds([]);
    setForm({
      date: c.date?.slice(0, 10) || '',
      start_time: c.start_time || '',
      end_time: c.end_time || '',
      total_hours: c.total_hours || '',
      faculty_id: c.faculty_id ? String(c.faculty_id) : '',
      nios_university_id: c.nios_university_id ? String(c.nios_university_id) : '',
      nios_batch_id: c.nios_batch_id ? String(c.nios_batch_id) : '',
      nios_chapter_ids: Array.isArray(c.chapters) && c.chapters.length
        ? c.chapters.map((ch) => String(ch.nios_chapter_id))
        : (c.nios_chapter_id ? [String(c.nios_chapter_id)] : []),
      class_status: c.class_status || 'scheduled',
      unit_chapter: c.unit_chapter || '',
      class_mode: c.class_mode || '',
      platform_used: c.platform_used || '',
      notes: c.notes || '',
    });

    setFormBatches(c.nios_university_id ? allBatches.filter((b) => String(b.nios_university_id) === String(c.nios_university_id)) : allBatches);
    setFormBatchSubjects([]);
    setChaptersBySubject({});
    setPickerSubject('');

    if (c.nios_university_id) {
      try {
        const usRes = await client.get('/nios/university-subjects', { params: { nios_university_id: c.nios_university_id } });
        setFormBatchSubjects(usRes.data);

        // Preload chapters for every subject this class already covers so the
        // selected-chapter chips resolve to names.
        const subjectIds = [...new Set((c.chapters || []).map((ch) => ch.nios_subject_id).filter(Boolean))];
        const map = {};
        for (const subjectId of subjectIds) {
          const us = usRes.data.find((s) => String(s.nios_subject_id) === String(subjectId));
          if (us) {
            const chapRes = await client.get('/nios/chapters', { params: { nios_university_subject_id: us.id } });
            map[subjectId] = chapRes.data;
          }
        }
        setChaptersBySubject(map);
        if (subjectIds[0]) setPickerSubject(String(subjectIds[0]));
      } catch { /**/ }
    }

    setFormOpen(true);
  }

  async function quickSetStatus(c, status) {
    try {
      const nios_chapter_ids = (c.chapters || []).map((ch) => String(ch.nios_chapter_id));
      await client.put(`/nios/classes/${c.id}`, { ...c, nios_chapter_ids, date: c.date?.slice(0, 10), class_status: status });
      toast.success('Status updated.');
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const isFanOut = multiBatch && !editing;
    const requiredSelects = [
      ['faculty_id', 'Faculty'],
      ['nios_university_id', 'University'],
      ...(isFanOut ? [] : [['nios_batch_id', 'Batch']]),
      ['class_mode', 'Class Mode'],
    ];
    const missing = requiredSelects.filter(([key]) => !form[key]).map(([, label]) => label);
    if (!form.nios_chapter_ids.length) missing.push('at least one Chapter');
    if (isFanOut && selectedBatchIds.length === 0) missing.push('at least one Batch');
    if (missing.length) { toast.error(`Please select: ${missing.join(', ')}.`); return; }

    setSaving(true);
    try {
      if (editing) {
        await client.put(`/nios/classes/${editing.id}`, form);
        toast.success('Class updated.');
      } else if (isFanOut) {
        await client.post('/nios/classes', { ...form, nios_batch_id: '', nios_batch_ids: selectedBatchIds });
        toast.success(`Class added for ${selectedBatchIds.length} batch${selectedBatchIds.length > 1 ? 'es' : ''}.`);
      } else {
        await client.post('/nios/classes', form);
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
      await client.delete(`/nios/classes/${deleteTarget.id}`);
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
  for (const c of classes) if (c.nios_class_group_id) groupSize[c.nios_class_group_id] = (groupSize[c.nios_class_group_id] || 0) + 1;
  const seenGroups = new Set();
  const displayClasses = classes.filter((c) => {
    if (!c.nios_class_group_id) return true;
    if (seenGroups.has(c.nios_class_group_id)) return false;
    seenGroups.add(c.nios_class_group_id);
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">NIOS Classes</h1>

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
                <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>University</Label>
              <Select value={filters.nios_university_id} onValueChange={handleFilterUniChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>{universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={filters.year} onValueChange={handleFilterYearChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Batch</Label>
              <Select value={filters.nios_batch_id} onValueChange={handleFilterBatchChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>{filterBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Select value={filters.nios_subject_id} onValueChange={(v) => setFilters({ ...filters, nios_subject_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>{filterSubjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
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
              setFilters(cleared);
              setFilterBatches(allBatches);
              setFilterSubjects(allSubjects);
              loadClasses(cleared);
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
          {loading ? <SkeletonTable rows={6} cols={8} /> : (
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
                <TableRow key={c.id}
                  className={c.class_status === 'taken' ? 'bg-green-100 hover:bg-green-200/70 dark:bg-green-900/30 dark:hover:bg-green-900/40' : ''}>
                  <TableCell className="text-slate-900 dark:text-slate-100">{c.date?.slice(0, 10)}</TableCell>
                  <TableCell>{c.faculty_name || '—'}</TableCell>
                  <TableCell>
                    <div className="text-slate-900 dark:text-slate-100">{subjectSummary(c) || '—'}</div>
                    {chapterSummary(c) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">{chapterSummary(c)}</div>
                    )}
                  </TableCell>
                  <TableCell>{c.university_name || '—'}</TableCell>
                  <TableCell>
                    {c.nios_class_group_id
                      ? <span title="Common-subject class across multiple batches">{c.batch_name || '—'} <span className="text-xs text-slate-400">+{(groupSize[c.nios_class_group_id] || 1) - 1} more</span></span>
                      : (c.batch_name || '—')}
                  </TableCell>
                  <TableCell>{c.total_hours || '—'}</TableCell>
                  <TableCell>{c.class_mode ? <StatusBadge status={c.class_mode} /> : '—'}</TableCell>
                  <TableCell>
                    <Select
                      value={c.class_status || 'scheduled'}
                      onValueChange={(v) => quickSetStatus(c, v)}
                      disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                    >
                      <SelectTrigger
                        className="h-7 w-32 text-xs"
                        title={takenLockReason(c.class_status, c.date, isAdmin()) || undefined}
                      ><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="taken">Taken</SelectItem>
                        <SelectItem value="not_taken">Not Taken</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setViewDialog(c)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}
                      disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                      title={takenLockReason(c.class_status, c.date, isAdmin()) || undefined}
                    >Edit</Button>
                    {isAdmin() && (
                      <Button size="sm" variant="outline"
                        className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900"
                        onClick={() => setDeleteTarget(c)}
                        disabled={!!takenLockReason(c.class_status, c.date, isAdmin())}
                        title={takenLockReason(c.class_status, c.date, isAdmin()) || undefined}>
                        Delete
                      </Button>
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
          <DialogHeader><DialogTitle>NIOS Class Details</DialogTitle></DialogHeader>
          {viewDialog && (() => {
            const groupRows = viewDialog.nios_class_group_id
              ? classes.filter((c) => String(c.nios_class_group_id) === String(viewDialog.nios_class_group_id))
              : null;
            const shared = [
              ['Date', viewDialog.date?.slice(0, 10)],
              ['Faculty', viewDialog.faculty_name],
              ['Subject', subjectSummary(viewDialog)],
              ['University', viewDialog.university_name],
              ...(groupRows ? [] : [['Batch', viewDialog.batch_name]]),
              ['Chapter', chapterSummary(viewDialog)],
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
                    <ul className="rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                      {groupRows.map((r) => (
                        <li key={r.id} className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.batch_name || '—'}</li>
                      ))}
                    </ul>
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
            {subjectSummary(deleteTarget) ? ` "${subjectSummary(deleteTarget)}"` : ''}
            {deleteTarget?.date ? ` on ${deleteTarget.date.slice(0, 10)}` : ''}? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit NIOS Class' : 'Add NIOS Class'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-5 pb-2">

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Class Details</p>
              <div className="grid grid-cols-2 gap-3">
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
                  <Select value={form.nios_university_id} onValueChange={handleFormUniChange}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {!editing && (
                  <div className="col-span-2 flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <div>
                      <Label className="mb-0">Common subject</Label>
                      <p className="text-xs text-slate-400">Schedule this class for multiple batches of this university at once.</p>
                    </div>
                    <Switch checked={multiBatch} onCheckedChange={handleMultiBatchToggle} />
                  </div>
                )}
                {multiBatch && !editing ? (
                  <div className="space-y-2 col-span-2">
                    <Label>Batches * <span className="text-xs font-normal text-slate-400">({selectedBatchIds.length} selected)</span></Label>
                    {!form.nios_university_id ? (
                      <p className="text-xs text-slate-400">Pick a university to see its batches.</p>
                    ) : formBatches.length === 0 ? (
                      <p className="text-xs text-slate-400">No batches in this university.</p>
                    ) : (
                      <div className="space-y-1 rounded-md border border-slate-200 dark:border-slate-700 p-3 max-h-56 overflow-y-auto">
                        {formBatches.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer pl-1">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={selectedBatchIds.includes(String(b.id))}
                              onChange={() => toggleBatchSelection(b.id)}
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Batch *</Label>
                    <Select value={form.nios_batch_id} onValueChange={handleFormBatchChange} disabled={!form.nios_university_id}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{formBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2 col-span-2">
                  <Label>Chapters * <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(pick one or more — from a single subject or across subjects)</span></Label>

                  {form.nios_chapter_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.nios_chapter_ids.map((id) => {
                        const { title, subject_name } = chapterLabel(id);
                        return (
                          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200">
                            {subject_name ? `${subject_name}: ` : ''}{title}
                            <button type="button" onClick={() => toggleChapter(id)} className="text-slate-400 hover:text-red-500" aria-label="Remove">×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <Select value={pickerSubject} onValueChange={handlePickerSubjectChange} disabled={!form.nios_batch_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={form.nios_batch_id ? 'Select a subject to add its chapters' : 'Select a batch first'} /></SelectTrigger>
                    <SelectContent>
                      {formBatchSubjects.map((s) => <SelectItem key={s.nios_subject_id} value={String(s.nios_subject_id)}>{s.subject_name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {pickerSubject && (
                    <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {(chaptersBySubject[pickerSubject] || []).length === 0 && (
                        <p className="p-2 text-xs text-slate-500 dark:text-slate-400">No chapters for this subject.</p>
                      )}
                      {(chaptersBySubject[pickerSubject] || []).map((ch) => {
                        const selected = form.nios_chapter_ids.includes(String(ch.id));
                        return (
                          <button type="button" key={ch.id} onClick={() => toggleChapter(ch.id)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${selected ? 'bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{selected ? '✓' : ''}</span>
                            {ch.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
