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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';

const emptyForm = {
  date: '', start_time: '', end_time: '', total_hours: '',
  faculty_id: '',
  nios_university_id: '', nios_batch_id: '', nios_subject_id: '', nios_chapter_id: '',
  class_status: 'scheduled',
  unit_chapter: '', class_mode: '', platform_used: '', notes: '',
  is_recorded: false, recording_file_name: '', recording_duration: '',
  storage_location: '', recording_link: '', backup_available: false,
  upload_student_app: false, upload_student_app_date: '', upload_student_app_link: '',
  upload_youtube: false, upload_youtube_date: '', upload_youtube_link: '', youtube_privacy: '',
  upload_gdrive: false, upload_gdrive_link: '',
  upload_harddisk: false, upload_harddisk_location: '',
};

const emptyFilters = {
  date_from: '', date_to: '', faculty_id: '', nios_university_id: '',
  year: '', nios_batch_id: '', nios_subject_id: '', class_mode: '', is_recorded: '',
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
  const [formChapters, setFormChapters] = useState([]);

  const [filters, setFilters] = useState(emptyFilters);
  const [formOpen, setFormOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chapterRecording, setChapterRecording] = useState(null);

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
    const initialFilters = { ...emptyFilters };
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

  async function handleFilterBatchChange(v) {
    setFilters({ ...filters, nios_batch_id: v, nios_subject_id: '' });
    if (v) {
      try {
        const res = await client.get('/nios/batch-subjects', { params: { nios_batch_id: v } });
        setFilterSubjects(res.data.map((bs) => ({ id: bs.nios_subject_id, name: bs.subject_name })));
      } catch { setFilterSubjects(allSubjects); }
    } else {
      setFilterSubjects(allSubjects);
    }
  }

  // ── Form cascade ──────────────────────────────────────────────────────────

  function handleFormUniChange(v) {
    setForm({ ...form, nios_university_id: v, nios_batch_id: '', nios_subject_id: '', nios_chapter_id: '' });
    setFormBatches(v ? allBatches.filter((b) => String(b.nios_university_id) === v) : allBatches);
    setFormBatchSubjects([]);
    setFormChapters([]);
  }

  async function handleFormBatchChange(v) {
    setForm((f) => ({ ...f, nios_batch_id: v, nios_subject_id: '', nios_chapter_id: '' }));
    setFormBatchSubjects([]);
    setFormChapters([]);
    if (v) {
      try {
        const res = await client.get('/nios/batch-subjects', { params: { nios_batch_id: v } });
        setFormBatchSubjects(res.data);
      } catch { /**/ }
    }
  }

  async function handleFormSubjectChange(subjectId) {
    setForm((f) => ({ ...f, nios_subject_id: subjectId, nios_chapter_id: '' }));
    setFormChapters([]);
    if (!subjectId) return;
    const bs = formBatchSubjects.find((s) => String(s.nios_subject_id) === subjectId);
    if (bs) {
      try {
        const res = await client.get('/nios/chapters', { params: { nios_batch_subject_id: bs.id } });
        setFormChapters(res.data);
      } catch { /**/ }
    }
  }

  async function handleFormChapterChange(v) {
    if (editing) { setForm((f) => ({ ...f, nios_chapter_id: v })); return; }
    setForm((f) => ({ ...f, nios_chapter_id: v }));
    setChapterRecording(null);
    if (!v) return;
    try {
      const res = await client.get('/nios/classes', { params: { nios_chapter_id: v, is_recorded: 'true' } });
      if (res.data.length > 0) setChapterRecording(res.data[0]);
    } catch { /* non-critical */ }
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
    setChapterRecording(null);
    setFormBatches(allBatches);
    setFormBatchSubjects([]);
    setFormChapters([]);
    setFormOpen(true);
  }

  async function openEdit(c) {
    setEditing(c);
    setForm({
      date: c.date?.slice(0, 10) || '',
      start_time: c.start_time || '',
      end_time: c.end_time || '',
      total_hours: c.total_hours || '',
      faculty_id: c.faculty_id ? String(c.faculty_id) : '',
      nios_university_id: c.nios_university_id ? String(c.nios_university_id) : '',
      nios_batch_id: c.nios_batch_id ? String(c.nios_batch_id) : '',
      nios_subject_id: c.nios_subject_id ? String(c.nios_subject_id) : '',
      nios_chapter_id: c.nios_chapter_id ? String(c.nios_chapter_id) : '',
      class_status: c.class_status || 'scheduled',
      unit_chapter: c.unit_chapter || '',
      class_mode: c.class_mode || '',
      platform_used: c.platform_used || '',
      notes: c.notes || '',
      is_recorded: c.is_recorded || false,
      recording_file_name: c.recording_file_name || '',
      recording_duration: c.recording_duration || '',
      storage_location: c.storage_location || '',
      recording_link: c.recording_link || '',
      backup_available: c.backup_available || false,
      upload_student_app: c.upload_student_app || false,
      upload_student_app_date: c.upload_student_app_date?.slice(0, 10) || '',
      upload_student_app_link: c.upload_student_app_link || '',
      upload_youtube: c.upload_youtube || false,
      upload_youtube_date: c.upload_youtube_date?.slice(0, 10) || '',
      upload_youtube_link: c.upload_youtube_link || '',
      youtube_privacy: c.youtube_privacy || '',
      upload_gdrive: c.upload_gdrive || false,
      upload_gdrive_link: c.upload_gdrive_link || '',
      upload_harddisk: c.upload_harddisk || false,
      upload_harddisk_location: c.upload_harddisk_location || '',
    });

    setChapterRecording(null);
    setFormBatches(c.nios_university_id ? allBatches.filter((b) => String(b.nios_university_id) === String(c.nios_university_id)) : allBatches);
    setFormBatchSubjects([]);
    setFormChapters([]);

    if (c.nios_batch_id) {
      try {
        const bsRes = await client.get('/nios/batch-subjects', { params: { nios_batch_id: c.nios_batch_id } });
        setFormBatchSubjects(bsRes.data);

        if (c.nios_subject_id) {
          const bs = bsRes.data.find((s) => String(s.nios_subject_id) === String(c.nios_subject_id));
          if (bs) {
            const chapRes = await client.get('/nios/chapters', { params: { nios_batch_subject_id: bs.id } });
            setFormChapters(chapRes.data);
          }
        }
      } catch { /**/ }
    }

    setFormOpen(true);
  }

  async function quickSetStatus(c, status) {
    try {
      await client.put(`/nios/classes/${c.id}`, { ...c, date: c.date?.slice(0, 10), class_status: status });
      toast.success('Status updated.');
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const requiredSelects = [
      ['faculty_id', 'Faculty'],
      ['nios_university_id', 'University'],
      ['nios_batch_id', 'Batch'],
      ['nios_subject_id', 'Subject'],
      ['nios_chapter_id', 'Chapter'],
      ['class_mode', 'Class Mode'],
    ];
    const missing = requiredSelects.filter(([key]) => !form[key]).map(([, label]) => label);
    if (missing.length) { toast.error(`Please select: ${missing.join(', ')}.`); return; }

    setSaving(true);
    try {
      if (editing) {
        await client.put(`/nios/classes/${editing.id}`, form);
        toast.success('Class updated.');
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

  function f(v) { return (s) => setForm({ ...form, [v]: s }); }

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
              <Label>Recording</Label>
              <Select value={filters.is_recorded} onValueChange={(v) => setFilters({ ...filters, is_recorded: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Recorded</SelectItem>
                  <SelectItem value="false">Not Recorded</SelectItem>
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
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => loadClasses()} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
            <Button size="sm" variant="outline" onClick={() => {
              const cleared = { ...emptyFilters };
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
                <TableHead className={TH}>Recorded</TableHead>
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
              {classes.map((c) => (
                <TableRow key={c.id}
                  className={c.class_status === 'taken' ? 'bg-green-100 hover:bg-green-200/70 dark:bg-green-900/30 dark:hover:bg-green-900/40' : ''}>
                  <TableCell className="text-slate-900 dark:text-slate-100">{c.date?.slice(0, 10)}</TableCell>
                  <TableCell>{c.faculty_name || '—'}</TableCell>
                  <TableCell>{c.subject_name || '—'}</TableCell>
                  <TableCell>{c.university_name || '—'}</TableCell>
                  <TableCell>{c.batch_name || '—'}</TableCell>
                  <TableCell>{c.total_hours || '—'}</TableCell>
                  <TableCell>{c.class_mode ? <StatusBadge status={c.class_mode} /> : '—'}</TableCell>
                  <TableCell><StatusBadge status={c.is_recorded ? 'recorded' : 'not_recorded'} /></TableCell>
                  <TableCell>
                    <Select value={c.class_status || 'scheduled'} onValueChange={(v) => quickSetStatus(c, v)}>
                      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="taken">Taken</SelectItem>
                        <SelectItem value="not_taken">Not Taken</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setViewDialog(c)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                    {isAdmin() && (
                      <Button size="sm" variant="outline"
                        className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900"
                        onClick={() => setDeleteTarget(c)}>
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>NIOS Class Details</DialogTitle></DialogHeader>
          {viewDialog && (
            <div className="space-y-2 text-sm">
              {[
                ['Date', viewDialog.date?.slice(0, 10)],
                ['Faculty', viewDialog.faculty_name],
                ['Subject', viewDialog.subject_name],
                ['University', viewDialog.university_name],
                ['Batch', viewDialog.batch_name],
                ['Chapter', viewDialog.chapter_title],
                ['Status', viewDialog.class_status],
                ['Start Time', viewDialog.start_time],
                ['End Time', viewDialog.end_time],
                ['Total Hours', viewDialog.total_hours],
                ['Mode', viewDialog.class_mode],
                ['Platform', viewDialog.platform_used],
                ['Unit/Chapter', viewDialog.unit_chapter],
                ['Notes', viewDialog.notes],
                ['Recorded', viewDialog.is_recorded ? 'Yes' : 'No'],
                ['Recording File', viewDialog.recording_file_name],
                ['Duration', viewDialog.recording_duration],
                ['Storage', viewDialog.storage_location],
                ['Recording Link', viewDialog.recording_link],
                ['Backup', viewDialog.backup_available ? 'Yes' : 'No'],
                ['Student App', viewDialog.upload_student_app ? 'Uploaded' : 'No'],
                ['YouTube', viewDialog.upload_youtube ? 'Uploaded' : 'No'],
                ['Google Drive', viewDialog.upload_gdrive ? 'Uploaded' : 'No'],
                ['Hard Disk', viewDialog.upload_harddisk ? 'Yes' : 'No'],
              ].map(([label, val]) => val !== null && val !== undefined && val !== '' && (
                <div key={label} className="flex gap-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300 w-32 shrink-0">{label}:</span>
                  <span className="text-slate-500 dark:text-slate-400">{String(val)}</span>
                </div>
              ))}
            </div>
          )}
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
                <div className="space-y-1">
                  <Label>Batch *</Label>
                  <Select value={form.nios_batch_id} onValueChange={handleFormBatchChange} disabled={!form.nios_university_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Subject *</Label>
                  <Select value={form.nios_subject_id} onValueChange={handleFormSubjectChange} disabled={!form.nios_batch_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {formBatchSubjects.map((s) => <SelectItem key={s.nios_subject_id} value={String(s.nios_subject_id)}>{s.subject_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Chapter *</Label>
                  <Select value={form.nios_chapter_id} onValueChange={handleFormChapterChange} disabled={!form.nios_subject_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formChapters.map((ch) => <SelectItem key={ch.id} value={String(ch.id)}>{ch.title}</SelectItem>)}</SelectContent>
                  </Select>
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

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Recording</p>
              {chapterRecording ? (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Already Recorded</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">A recording exists for this chapter</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {chapterRecording.date && <><span className="text-slate-500 dark:text-slate-400">Date</span><span className="text-slate-900 dark:text-slate-100">{chapterRecording.date?.slice(0,10)}</span></>}
                    {chapterRecording.faculty_name && <><span className="text-slate-500 dark:text-slate-400">Faculty</span><span className="text-slate-900 dark:text-slate-100">{chapterRecording.faculty_name}</span></>}
                    {chapterRecording.recording_file_name && <><span className="text-slate-500 dark:text-slate-400">File</span><span className="text-slate-900 dark:text-slate-100 truncate">{chapterRecording.recording_file_name}</span></>}
                    {chapterRecording.recording_duration && <><span className="text-slate-500 dark:text-slate-400">Duration</span><span className="text-slate-900 dark:text-slate-100">{chapterRecording.recording_duration}</span></>}
                    {chapterRecording.storage_location && <><span className="text-slate-500 dark:text-slate-400">Storage</span><span className="text-slate-900 dark:text-slate-100">{chapterRecording.storage_location}</span></>}
                    {chapterRecording.recording_link && <><span className="text-slate-500 dark:text-slate-400">Link</span><a href={chapterRecording.recording_link} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 truncate hover:underline">{chapterRecording.recording_link}</a></>}
                    {chapterRecording.backup_available && <><span className="text-slate-500 dark:text-slate-400">Backup</span><span className="text-green-700 dark:text-green-300">Available</span></>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Switch checked={form.is_recorded} onCheckedChange={f('is_recorded')} id="is_recorded" />
                    <Label htmlFor="is_recorded">Was this class recorded?</Label>
                  </div>
                  {form.is_recorded && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>File Name</Label>
                        <Input value={form.recording_file_name} onChange={(e) => setForm({ ...form, recording_file_name: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Duration</Label>
                        <Input value={form.recording_duration} onChange={(e) => setForm({ ...form, recording_duration: e.target.value })} placeholder="e.g. 1h 30m" />
                      </div>
                      <div className="space-y-1">
                        <Label>Storage Location</Label>
                        <Input value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Recording Link</Label>
                        <Input value={form.recording_link} onChange={(e) => setForm({ ...form, recording_link: e.target.value })} />
                      </div>
                      <div className="flex items-center gap-3 col-span-2">
                        <Switch checked={form.backup_available} onCheckedChange={f('backup_available')} id="backup" />
                        <Label htmlFor="backup">Backup Available</Label>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload Status</p>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch checked={form.upload_student_app} onCheckedChange={f('upload_student_app')} id="stu_app" />
                  <Label htmlFor="stu_app">Student App</Label>
                </div>
                {form.upload_student_app && (
                  <div className="grid grid-cols-2 gap-3 pl-9">
                    <div className="space-y-1">
                      <Label>Upload Date</Label>
                      <Input type="date" value={form.upload_student_app_date} onChange={(e) => setForm({ ...form, upload_student_app_date: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Link</Label>
                      <Input value={form.upload_student_app_link} onChange={(e) => setForm({ ...form, upload_student_app_link: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch checked={form.upload_youtube} onCheckedChange={f('upload_youtube')} id="yt" />
                  <Label htmlFor="yt">YouTube</Label>
                </div>
                {form.upload_youtube && (
                  <div className="grid grid-cols-2 gap-3 pl-9">
                    <div className="space-y-1">
                      <Label>Upload Date</Label>
                      <Input type="date" value={form.upload_youtube_date} onChange={(e) => setForm({ ...form, upload_youtube_date: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Link</Label>
                      <Input value={form.upload_youtube_link} onChange={(e) => setForm({ ...form, upload_youtube_link: e.target.value })} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label>Privacy</Label>
                      <Select value={form.youtube_privacy} onValueChange={(v) => setForm({ ...form, youtube_privacy: v })}>
                        <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="unlisted">Unlisted</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch checked={form.upload_gdrive} onCheckedChange={f('upload_gdrive')} id="gdrive" />
                  <Label htmlFor="gdrive">Google Drive</Label>
                </div>
                {form.upload_gdrive && (
                  <div className="pl-9">
                    <div className="space-y-1">
                      <Label>Drive Link</Label>
                      <Input value={form.upload_gdrive_link} onChange={(e) => setForm({ ...form, upload_gdrive_link: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch checked={form.upload_harddisk} onCheckedChange={f('upload_harddisk')} id="hdd" />
                  <Label htmlFor="hdd">Hard Disk</Label>
                </div>
                {form.upload_harddisk && (
                  <div className="pl-9">
                    <div className="space-y-1">
                      <Label>Location</Label>
                      <Input value={form.upload_harddisk_location} onChange={(e) => setForm({ ...form, upload_harddisk_location: e.target.value })} />
                    </div>
                  </div>
                )}
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
