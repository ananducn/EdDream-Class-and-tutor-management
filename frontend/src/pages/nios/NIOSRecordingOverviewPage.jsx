import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import client from '@/api/client';
import { toast } from 'sonner';

// NIOS recordings live on the chapter (shared by every batch of the university).

function StatCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    green: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300',
    red:   'border-red-200   dark:border-red-800   bg-red-50   dark:bg-red-950   text-red-700   dark:text-red-300',
    amber: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
    slate: 'border-slate-200 dark:border-slate-700 bg-white    dark:bg-slate-900 text-slate-700 dark:text-slate-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

const DESTINATIONS = [
  { flag: 'upload_youtube',     link: 'upload_youtube_link',     label: 'YouTube' },
  { flag: 'upload_gdrive',      link: 'upload_gdrive_link',      label: 'Google Drive' },
  { flag: 'upload_student_app', link: 'upload_student_app_link', label: 'Student App' },
  { flag: 'upload_harddisk',    link: 'upload_harddisk_location', label: 'Local / Hard Disk' },
];

const emptyRec = {
  is_recorded: false, faculty_id: '', recording_date: '', recording_file_name: '',
  recording_duration: '', notes: '', editing_status: 'not_edited', backup_available: false,
  storage_location: '',
  upload_youtube: false, upload_youtube_link: '', youtube_privacy: '',
  upload_gdrive: false, upload_gdrive_link: '',
  upload_student_app: false, upload_student_app_link: '',
  upload_harddisk: false, upload_harddisk_location: '',
};

function destinationSummary(ch) {
  return DESTINATIONS.filter((d) => ch[d.flag]).map((d) => d.label).join(', ');
}

export default function NIOSRecordingOverviewPage() {
  const [universities, setUniversities] = useState([]);
  const [subjects, setSubjects] = useState([]); // nios_university_subjects rows
  const [faculty, setFaculty] = useState([]);

  const [selUni, setSelUni] = useState('');
  const [selSubject, setSelSubject] = useState(''); // nios_university_subject id

  const [chapters, setChapters] = useState([]);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapter, setEditorChapter] = useState(null);
  const [rec, setRec] = useState(emptyRec);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      client.get('/nios/universities'),
      client.get('/faculty'),
    ]).then(([u, f]) => {
      setUniversities(u.data);
      setFaculty(f.data);
    }).catch(() => toast.error('Failed to load dropdowns.'));
  }, []);

  async function handleUni(v) {
    setSelUni(v); setSelSubject(''); setSubjects([]); setChapters([]); setOverview([]);
    if (!v) return;
    try {
      const [subs, ov] = await Promise.all([
        client.get('/nios/university-subjects', { params: { nios_university_id: v } }),
        client.get('/nios/chapter-recordings/overview', { params: { nios_university_id: v } }),
      ]);
      setSubjects(subs.data);
      setOverview(ov.data);
    } catch { toast.error('Failed to load university syllabus.'); }
  }

  async function handleSubject(v) {
    setSelSubject(v); setChapters([]);
    if (!v) return;
    setLoading(true);
    try {
      const res = await client.get('/nios/chapter-recordings', { params: { nios_university_subject_id: v } });
      setChapters(res.data);
    } catch { toast.error('Failed to load chapters.'); }
    finally { setLoading(false); }
  }

  function openEditor(ch) {
    setEditorChapter(ch);
    setRec({
      ...emptyRec,
      is_recorded: !!ch.is_recorded,
      faculty_id: ch.faculty_id ? String(ch.faculty_id) : '',
      recording_date: ch.recording_date ? ch.recording_date.slice(0, 10) : '',
      recording_file_name: ch.recording_file_name || '',
      recording_duration: ch.recording_duration || '',
      notes: ch.notes || '',
      editing_status: ch.editing_status || 'not_edited',
      backup_available: !!ch.backup_available,
      storage_location: ch.storage_location || '',
      upload_youtube: !!ch.upload_youtube, upload_youtube_link: ch.upload_youtube_link || '',
      youtube_privacy: ch.youtube_privacy || '',
      upload_gdrive: !!ch.upload_gdrive, upload_gdrive_link: ch.upload_gdrive_link || '',
      upload_student_app: !!ch.upload_student_app, upload_student_app_link: ch.upload_student_app_link || '',
      upload_harddisk: !!ch.upload_harddisk, upload_harddisk_location: ch.upload_harddisk_location || '',
    });
    setEditorOpen(true);
  }

  async function saveRecording(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.put(`/nios/chapter-recordings/${editorChapter.nios_chapter_id}`, {
        ...rec,
        faculty_id: rec.faculty_id || null,
        recording_date: rec.recording_date || null,
        youtube_privacy: rec.youtube_privacy || null,
      });
      toast.success('Recording saved.');
      setEditorOpen(false);
      if (selSubject) await handleSubject(selSubject);
      if (selUni) {
        const ov = await client.get('/nios/chapter-recordings/overview', { params: { nios_university_id: selUni } });
        setOverview(ov.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(() => {
    const chs = overview.filter((r) => r.chapter_id);
    return {
      total: chs.length,
      recorded: chs.filter((r) => r.recorded).length,
      notRecorded: chs.filter((r) => !r.recorded).length,
      pendingUpload: chs.filter((r) => r.recorded_not_uploaded).length,
    };
  }, [overview]);

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">NIOS Recordings</h1>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>NIOS University *</Label>
              <Select value={selUni} onValueChange={handleUni}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject *</Label>
              <Select value={selSubject} onValueChange={handleSubject} disabled={subjects.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.subject_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {overview.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Chapters" value={summary.total}        color="slate" />
          <StatCard label="Recorded"       value={summary.recorded}     color="green" />
          <StatCard label="Not Recorded"   value={summary.notRecorded}  color="red" />
          <StatCard label="Pending Upload" value={summary.pendingUpload} color="amber" sub="recorded, not on any destination" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Chapters</CardTitle>
        </CardHeader>
        <CardContent>
          {!selSubject ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">
              Pick a university and subject to manage its chapter recordings.
            </p>
          ) : loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No chapters for this subject.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${TH} w-8`}>#</TableHead>
                    <TableHead className={TH}>Chapter</TableHead>
                    <TableHead className={TH}>Recorded</TableHead>
                    <TableHead className={TH}>Where</TableHead>
                    <TableHead className={`${TH} text-right`}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chapters.map((ch) => (
                    <TableRow key={ch.nios_chapter_id}>
                      <TableCell className="text-slate-400 tabular-nums">{ch.chapter_order}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{ch.chapter_title}</TableCell>
                      <TableCell>
                        {ch.is_recorded
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recorded</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Not recorded</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{destinationSummary(ch) || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditor(ch)}>Edit recording</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Recording — {editorChapter?.chapter_title}</DialogTitle></DialogHeader>
          <form onSubmit={saveRecording} className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={rec.is_recorded} onCheckedChange={(v) => setRec({ ...rec, is_recorded: v })} id="is_recorded" />
              <Label htmlFor="is_recorded">This chapter is recorded</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Faculty</Label>
                <Select value={rec.faculty_id} onValueChange={(v) => setRec({ ...rec, faculty_id: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Recording Date</Label>
                <Input type="date" value={rec.recording_date} onChange={(e) => setRec({ ...rec, recording_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>File Name</Label>
                <Input value={rec.recording_file_name} onChange={(e) => setRec({ ...rec, recording_file_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Duration</Label>
                <Input value={rec.recording_duration} onChange={(e) => setRec({ ...rec, recording_duration: e.target.value })} placeholder="e.g. 1h 30m" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Where the recording lives</p>
              {DESTINATIONS.map((d) => (
                <div key={d.flag} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Switch checked={rec[d.flag]} onCheckedChange={(v) => setRec({ ...rec, [d.flag]: v })} id={d.flag} />
                    <Label htmlFor={d.flag}>{d.label}</Label>
                  </div>
                  {rec[d.flag] && (
                    <Input
                      value={rec[d.link]}
                      onChange={(e) => setRec({ ...rec, [d.link]: e.target.value })}
                      placeholder={d.flag === 'upload_harddisk' ? 'Location / label' : 'Link'}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Editing Status</Label>
                <Select value={rec.editing_status} onValueChange={(v) => setRec({ ...rec, editing_status: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_edited">Not edited</SelectItem>
                    <SelectItem value="edited">Edited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={rec.backup_available} onCheckedChange={(v) => setRec({ ...rec, backup_available: v })} id="backup" />
                <Label htmlFor="backup">Backup available</Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={rec.notes} onChange={(e) => setRec({ ...rec, notes: e.target.value })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
