import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/StatusBadge';
import client from '@/api/client';

const emptyForm = {
  date: '', start_time: '', end_time: '', total_hours: '',
  faculty_id: '', subject_id: '', university_id: '', stream_id: '', batch_id: '',
  class_status: 'scheduled',
  unit_chapter: '', class_mode: '', platform_used: '', notes: '',
  is_recorded: false, recording_file_name: '', recording_duration: '',
  storage_location: '', recording_link: '', backup_available: false,
  editing_status: 'not_edited',
  upload_student_app: false, upload_student_app_date: '', upload_student_app_link: '',
  upload_youtube: false, upload_youtube_date: '', upload_youtube_link: '', youtube_privacy: '',
  upload_gdrive: false, upload_gdrive_link: '',
  upload_harddisk: false, upload_harddisk_location: '',
  payment_status: 'pending', payment_remarks: '',
};

const emptyFilters = {
  date_from: '', date_to: '', faculty_id: '', subject_id: '', university_id: '',
  batch_id: '', class_mode: '', is_recorded: '', editing_status: '', class_status: '',
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
  const [formSubjects, setFormSubjects] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

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
    setFormSubjects(sRes.data);
  }

  async function loadClasses(params = filters) {
    setLoading(true);
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
    const initialFilters = { ...emptyFilters };
    searchParams.forEach((v, k) => { if (k in initialFilters) initialFilters[k] = v; });
    setFilters(initialFilters);
    loadClasses(initialFilters);
  }, []);

  function handleFilterUniChange(v) {
    setFilters({ ...filters, university_id: v, batch_id: '' });
    setFilteredBatches(v ? batches.filter((b) => String(b.university_id) === v) : batches);
  }

  function handleFormUniChange(v) {
    setForm({ ...form, university_id: v, stream_id: '', batch_id: '', subject_id: '' });
    setFormStreams(v ? streams.filter((s) => String(s.university_id) === v) : streams);
    setFormBatches(v ? batches.filter((b) => String(b.university_id) === v) : batches);
    setFormSubjects(v ? subjects.filter((s) => String(s.university_id) === v) : subjects);
  }

  function handleFormStreamChange(v) {
    setForm({ ...form, stream_id: v, batch_id: '', subject_id: '' });
    setFormBatches(v ? batches.filter((b) => String(b.stream_id) === v) : batches.filter((b) => String(b.university_id) === form.university_id));
    setFormSubjects(v ? subjects.filter((s) => String(s.stream_id) === v) : subjects.filter((s) => String(s.university_id) === form.university_id));
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
    setFormStreams(streams);
    setFormBatches(batches);
    setFormSubjects(subjects);
    setSheetOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
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
      editing_status: c.editing_status || 'not_edited',
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
      payment_status: c.payment_status || 'pending',
      payment_remarks: c.payment_remarks || '',
    });
    setFormStreams(c.university_id ? streams.filter((s) => String(s.university_id) === String(c.university_id)) : streams);
    if (c.stream_id) {
      setFormBatches(batches.filter((b) => String(b.stream_id) === String(c.stream_id)));
      setFormSubjects(subjects.filter((s) => String(s.stream_id) === String(c.stream_id)));
    } else {
      setFormBatches(c.university_id ? batches.filter((b) => String(b.university_id) === String(c.university_id)) : batches);
      setFormSubjects(c.university_id ? subjects.filter((s) => String(s.university_id) === String(c.university_id)) : subjects);
    }
    setSheetOpen(true);
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
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await client.put(`/classes/${editing.id}`, payload);
        toast.success('Class updated.');
      } else {
        await client.post('/classes', payload);
        toast.success('Class added.');
      }
      setSheetOpen(false);
      loadClasses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function f(v) { return (s) => setForm({ ...form, [v]: s }); }

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

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
              <Label>Editing</Label>
              <Select value={filters.editing_status} onValueChange={(v) => setFilters({ ...filters, editing_status: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_edited">Not Edited</SelectItem>
                  <SelectItem value="edited">Edited</SelectItem>
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
            <Button size="sm" variant="outline" onClick={() => { setFilters(emptyFilters); setFilteredBatches(batches); loadClasses(emptyFilters); }}>Clear</Button>
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
                <TableHead className={TH}>Editing</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} text-right`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No classes found.</TableCell>
                </TableRow>
              )}
              {classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-slate-900 dark:text-slate-100">{c.date?.slice(0, 10)}</TableCell>
                  <TableCell>{c.faculty_name || '—'}</TableCell>
                  <TableCell>{c.subject_name || '—'}</TableCell>
                  <TableCell>{c.university_name || '—'}</TableCell>
                  <TableCell>{c.batch_name || '—'}</TableCell>
                  <TableCell>{c.total_hours || '—'}</TableCell>
                  <TableCell>
                    {c.class_mode ? <StatusBadge status={c.class_mode} /> : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.is_recorded ? 'recorded' : 'not_recorded'} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.editing_status === 'edited' ? 'edited' : 'not_edited'} />
                  </TableCell>
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
          <DialogHeader><DialogTitle>Class Details</DialogTitle></DialogHeader>
          {viewDialog && (
            <div className="space-y-2 text-sm">
              {[
                ['Date', viewDialog.date?.slice(0, 10)],
                ['Faculty', viewDialog.faculty_name],
                ['Subject', viewDialog.subject_name],
                ['University', viewDialog.university_name],
                ['Stream', viewDialog.stream_name],
                ['Batch', viewDialog.batch_name],
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
                ['Editing', viewDialog.editing_status],
                ['Student App', viewDialog.upload_student_app ? 'Uploaded' : 'No'],
                ['YouTube', viewDialog.upload_youtube ? 'Uploaded' : 'No'],
                ['Google Drive', viewDialog.upload_gdrive ? 'Uploaded' : 'No'],
                ['Hard Disk', viewDialog.upload_harddisk ? 'Yes' : 'No'],
                ['Payment', viewDialog.payment_status],
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

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Class' : 'Add Class'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-5 pb-8">

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Class Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => handleTimeChange('start_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>End Time</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => handleTimeChange('end_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Total Hours</Label>
                  <Input type="number" min="0" step="0.01" value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Faculty</Label>
                  <Select value={form.faculty_id} onValueChange={(v) => setForm({ ...form, faculty_id: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>University</Label>
                  <Select value={form.university_id} onValueChange={handleFormUniChange}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Stream</Label>
                  <Select value={form.stream_id} onValueChange={handleFormStreamChange} disabled={!form.university_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formStreams.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Batch</Label>
                  <Select value={form.batch_id} onValueChange={(v) => setForm({ ...form, batch_id: v })} disabled={!form.university_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })} disabled={!form.university_id}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{formSubjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
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
                <div className="space-y-1 col-span-2">
                  <Label>Unit / Chapter</Label>
                  <Input value={form.unit_chapter} onChange={(e) => setForm({ ...form, unit_chapter: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Class Mode</Label>
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
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Editing Status</p>
              <Select value={form.editing_status} onValueChange={(v) => setForm({ ...form, editing_status: v })}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_edited">Not Edited</SelectItem>
                  <SelectItem value="edited">Edited</SelectItem>
                </SelectContent>
              </Select>
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

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payment Status</Label>
                  <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payment Remarks</Label>
                  <Input value={form.payment_remarks} onChange={(e) => setForm({ ...form, payment_remarks: e.target.value })} />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Class'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
