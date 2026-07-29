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
import { SkeletonTable } from '@/components/Skeletons';
import { toast } from 'sonner';

// NIOS recordings live on the chapter (shared by every batch of the university).

function StatCard({ label, value, sub, color = 'slate', onClick }) {
  const colors = {
    green: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300',
    red:   'border-red-200   dark:border-red-800   bg-red-50   dark:bg-red-950   text-red-700   dark:text-red-300',
    amber: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
    blue:  'border-blue-200  dark:border-blue-800  bg-blue-50  dark:bg-blue-950  text-blue-700  dark:text-blue-300',
    slate: 'border-slate-200 dark:border-slate-700 bg-white    dark:bg-slate-900 text-slate-700 dark:text-slate-200',
  };
  const clickable = typeof onClick === 'function';
  const Comp = clickable ? 'button' : 'div';
  return (
    <Comp
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-4 ${colors[color]} ${
        clickable ? 'cursor-pointer transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 dark:focus:ring-offset-slate-900' : ''
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </Comp>
  );
}

// One label/value line inside the chapter details modal.
function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 pt-0.5">{label}</p>
      <div className="col-span-2 text-sm text-slate-900 dark:text-slate-100 break-words">{children ?? '—'}</div>
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
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]); // nios_stream_subjects rows
  const [faculty, setFaculty] = useState([]);

  const [selUni, setSelUni] = useState('');
  const [selStream, setSelStream] = useState('');
  const [selSubject, setSelSubject] = useState(''); // nios_stream_subject id

  const [chapters, setChapters] = useState([]);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapter, setEditorChapter] = useState(null);
  const [rec, setRec] = useState(emptyRec);
  const [saving, setSaving] = useState(false);

  // Read-only details modal for a single chapter, and the drill-down modal behind
  // a stat card.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMeta, setDetailsMeta] = useState(null);
  const [detailsRec, setDetailsRec] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [statModal, setStatModal] = useState(null); // { key, label }

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
    setSelUni(v); setSelStream(''); setSelSubject('');
    setStreams([]); setSubjects([]); setChapters([]); setOverview([]);
    if (!v) return;
    setLoading(true);
    try {
      const [st, subs, ov] = await Promise.all([
        client.get('/nios/streams', { params: { nios_university_id: v } }),
        client.get('/nios/stream-subjects', { params: { nios_university_id: v } }),
        client.get('/nios/chapter-recordings/overview', { params: { nios_university_id: v } }),
      ]);
      setStreams(st.data);
      setSubjects(subs.data);
      setOverview(ov.data);
    } catch { toast.error('Failed to load university syllabus.'); }
    finally { setLoading(false); }
  }

  // Narrowing to a stream also narrows the subject list to that stream's syllabus.
  function handleStream(v) {
    if (v === '__none') v = '';
    setSelStream(v);
    setSelSubject('');
    setChapters([]);
  }

  async function handleSubject(v) {
    if (v === '__none') v = '';
    setSelSubject(v); setChapters([]);
    if (!v) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await client.get('/nios/chapter-recordings', { params: { nios_stream_subject_id: v } });
      setChapters(res.data);
    } catch { toast.error('Failed to load chapters.'); }
    finally { setLoading(false); }
  }

  // Open the editor from a report row (which only has status flags): fetch the
  // full recording for that chapter and prefill.
  async function openEditorByChapter(row) {
    if (!row.chapter_id) return;
    try {
      const res = await client.get(`/nios/chapter-recordings/${row.chapter_id}`);
      openEditor({ ...(res.data || {}), nios_chapter_id: row.chapter_id, chapter_title: row.chapter_title });
    } catch { toast.error('Failed to load recording.'); }
  }

  // Read-only details for a chapter. The per-subject table already carries the
  // recording columns, so it passes them in; overview rows only have flags and
  // need a fetch.
  async function openDetails(row, prefetched) {
    if (!row.chapter_id) return;
    setDetailsMeta(row);
    setDetailsOpen(true);
    if (prefetched !== undefined) { setDetailsRec(prefetched); setDetailsLoading(false); return; }
    setDetailsRec(null);
    setDetailsLoading(true);
    try {
      const res = await client.get(`/nios/chapter-recordings/${row.chapter_id}`);
      setDetailsRec(res.data || null);
    } catch { toast.error('Failed to load recording details.'); }
    finally { setDetailsLoading(false); }
  }

  function editFromDetails() {
    const meta = detailsMeta;
    setDetailsOpen(false);
    openEditor({ ...(detailsRec || {}), nios_chapter_id: meta.chapter_id, chapter_title: meta.chapter_title });
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

  // The same subject can sit in several streams, so the picker only offers the
  // placements belonging to the selected stream.
  const visibleSubjects = useMemo(
    () => (selStream ? subjects.filter((s) => String(s.nios_stream_id) === String(selStream)) : subjects),
    [subjects, selStream],
  );

  // Stats follow the filters: a selected stream or subject narrows them,
  // otherwise they cover the whole university.
  const scopedOverview = useMemo(
    () => {
      let rows = overview;
      if (selStream) rows = rows.filter((r) => String(r.nios_stream_id) === String(selStream));
      if (selSubject) rows = rows.filter((r) => String(r.nios_stream_subject_id) === String(selSubject));
      return rows;
    },
    [overview, selStream, selSubject],
  );

  // A common subject is placed in several streams, so the overview returns one
  // row per (stream, chapter). Counting those rows would report a shared
  // chapter — and its single recording — once per stream. Collapse to distinct
  // chapters so these totals agree with the main app's /reports/recordings,
  // which counts straight from the chapters table.
  const distinctChapters = useMemo(() => {
    const byChapter = new Map();
    for (const r of scopedOverview) {
      if (r.chapter_id && !byChapter.has(r.chapter_id)) byChapter.set(r.chapter_id, r);
    }
    return [...byChapter.values()];
  }, [scopedOverview]);

  const summary = useMemo(() => ({
    subjects: new Set(scopedOverview.map((r) => r.nios_subject_id)).size,
    total: distinctChapters.length,
    recorded: distinctChapters.filter((r) => r.recorded).length,
    notRecorded: distinctChapters.filter((r) => !r.recorded).length,
    pendingUpload: distinctChapters.filter((r) => r.recorded_not_uploaded).length,
  }), [scopedOverview, distinctChapters]);

  const facultyName = (id) => faculty.find((f) => String(f.id) === String(id))?.name || null;

  const selSubjectName = useMemo(
    () => subjects.find((s) => String(s.id) === String(selSubject))?.subject_name || '',
    [subjects, selSubject],
  );

  // Rows behind whichever stat card was clicked. "subjects" is a per-subject
  // roll-up; every other key is a filtered chapter list.
  const statRows = useMemo(() => {
    if (!statModal) return [];
    const chs = distinctChapters;
    if (statModal.key === 'subjects') {
      // Roll up by subject, not by placement, so a common subject is one row
      // whose chapter counts aren't doubled by its second stream.
      const bySubject = new Map();
      const seen = new Set();
      for (const r of scopedOverview) {
        const key = r.nios_subject_id;
        if (!bySubject.has(key)) bySubject.set(key, { ...r, total: 0, recorded: 0, pending: 0 });
        const agg = bySubject.get(key);
        if (r.chapter_id && !seen.has(r.chapter_id)) {
          seen.add(r.chapter_id);
          agg.total += 1;
          if (r.recorded) agg.recorded += 1;
          if (r.recorded_not_uploaded) agg.pending += 1;
        }
      }
      return [...bySubject.values()];
    }
    if (statModal.key === 'recorded')      return chs.filter((r) => r.recorded);
    if (statModal.key === 'notRecorded')   return chs.filter((r) => !r.recorded);
    if (statModal.key === 'pendingUpload') return chs.filter((r) => r.recorded_not_uploaded);
    return chs;
  }, [statModal, scopedOverview, distinctChapters]);

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
              <Label>Stream</Label>
              <Select value={selStream} onValueChange={handleStream} disabled={streams.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All streams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All streams</SelectItem>
                  {streams.map((st) => <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Select value={selSubject} onValueChange={handleSubject} disabled={visibleSubjects.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All subjects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All subjects</SelectItem>
                  {visibleSubjects.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {selStream ? s.subject_name : `${s.stream_name} · ${s.subject_name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {overview.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total Subjects" value={summary.subjects}     color="blue"  onClick={() => setStatModal({ key: 'subjects',      label: 'Subjects' })} />
          <StatCard label="Total Chapters" value={summary.total}        color="slate" onClick={() => setStatModal({ key: 'total',         label: 'All Chapters' })} />
          <StatCard label="Recorded"       value={summary.recorded}     color="green" onClick={() => setStatModal({ key: 'recorded',      label: 'Recorded Chapters' })} />
          <StatCard label="Not Recorded"   value={summary.notRecorded}  color="red"   onClick={() => setStatModal({ key: 'notRecorded',   label: 'Not Recorded Chapters' })} />
          <StatCard label="Pending Upload" value={summary.pendingUpload} color="amber" sub="recorded, not on any destination" onClick={() => setStatModal({ key: 'pendingUpload', label: 'Pending Upload' })} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Chapters</CardTitle>
        </CardHeader>
        <CardContent>
          {selSubject ? (
            loading ? (
            <SkeletonTable rows={5} cols={5} />
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
                    <TableRow
                      key={ch.nios_chapter_id}
                      onClick={() => openDetails(
                        { chapter_id: ch.nios_chapter_id, chapter_title: ch.chapter_title, chapter_order: ch.chapter_order, subject_name: selSubjectName },
                        ch.recording_id ? ch : null,
                      )}
                      className="cursor-pointer"
                    >
                      <TableCell className="text-slate-400 tabular-nums">{ch.chapter_order}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{ch.chapter_title}</TableCell>
                      <TableCell>
                        {ch.is_recorded
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recorded</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Not recorded</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{destinationSummary(ch) || '—'}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={() => openEditor(ch)}>Edit recording</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
          ) : loading ? (
            <SkeletonTable rows={6} cols={4} />
          ) : scopedOverview.filter((r) => r.chapter_id).length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">
              {overview.length === 0
                ? 'Pick a NIOS university to see its recording report.'
                : selStream
                  ? 'No chapters in this stream yet.'
                  : 'No chapters at this level yet.'}
            </p>
          ) : (
            /* No subject picked: the syllabus for whatever is in scope, as a report. */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!selStream && <TableHead className={TH}>Stream</TableHead>}
                    <TableHead className={TH}>Subject</TableHead>
                    <TableHead className={TH}>Chapter</TableHead>
                    <TableHead className={TH}>Recorded</TableHead>
                    <TableHead className={TH}>Upload</TableHead>
                    <TableHead className={`${TH} text-right`}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedOverview.filter((r) => r.chapter_id).map((r) => (
                    // A common subject sits in several streams, so the same
                    // chapter_id can appear more than once — key on the placement too.
                    <TableRow key={`${r.nios_stream_subject_id}-${r.chapter_id}`} onClick={() => openDetails(r)} className="cursor-pointer">
                      {!selStream && <TableCell className="text-sm text-slate-500 dark:text-slate-400">{r.stream_name}</TableCell>}
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{r.subject_name}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.chapter_title}</TableCell>
                      <TableCell>
                        {r.recorded
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recorded</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Not recorded</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm">
                        {!r.recorded
                          ? <span className="text-slate-400">—</span>
                          : r.recorded_not_uploaded
                            ? <span className="text-amber-600 dark:text-amber-400">Pending</span>
                            : <span className="text-green-600 dark:text-green-400">Uploaded</span>}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={() => openEditorByChapter(r)}>Edit recording</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chapter details (read-only) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsMeta?.chapter_title || 'Chapter'}</DialogTitle>
          </DialogHeader>

          {detailsLoading ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div>
                <DetailRow label="Subject">{detailsMeta?.subject_name}</DetailRow>
                <DetailRow label="Chapter">
                  {detailsMeta?.chapter_order ? `${detailsMeta.chapter_order}. ` : ''}{detailsMeta?.chapter_title}
                </DetailRow>
              </div>

              {!detailsRec ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                  No recording has been logged for this chapter yet.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Recording</p>
                    <DetailRow label="Status">
                      {detailsRec.is_recorded
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recorded</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Not recorded</span>}
                    </DetailRow>
                    <DetailRow label="Faculty">{detailsRec.faculty_name || facultyName(detailsRec.faculty_id)}</DetailRow>
                    <DetailRow label="Date">{detailsRec.recording_date ? detailsRec.recording_date.slice(0, 10) : null}</DetailRow>
                    <DetailRow label="Duration">{detailsRec.recording_duration}</DetailRow>
                    <DetailRow label="File name">{detailsRec.recording_file_name}</DetailRow>
                    <DetailRow label="Editing">{detailsRec.editing_status === 'edited' ? 'Edited' : 'Not edited'}</DetailRow>
                    <DetailRow label="Backup">{detailsRec.backup_available ? 'Available' : 'Not available'}</DetailRow>
                    <DetailRow label="Storage">{detailsRec.storage_location}</DetailRow>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Where the recording lives</p>
                    {DESTINATIONS.filter((d) => detailsRec[d.flag]).length === 0 ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400 py-1.5">Not uploaded to any destination.</p>
                    ) : (
                      DESTINATIONS.filter((d) => detailsRec[d.flag]).map((d) => (
                        <DetailRow key={d.flag} label={d.label}>
                          {detailsRec[d.link]
                            ? (/^https?:\/\//i.test(detailsRec[d.link])
                                ? <a href={detailsRec[d.link]} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{detailsRec[d.link]}</a>
                                : detailsRec[d.link])
                            : <span className="text-slate-400">Marked, no link</span>}
                          {d.flag === 'upload_youtube' && detailsRec.youtube_privacy && (
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({detailsRec.youtube_privacy})</span>
                          )}
                        </DetailRow>
                      ))
                    )}
                  </div>

                  {detailsRec.notes && (
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Notes</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{detailsRec.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
            <Button type="button" onClick={editFromDetails} disabled={detailsLoading}>Edit recording</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stat card drill-down */}
      <Dialog open={!!statModal} onOpenChange={(o) => !o && setStatModal(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{statModal?.label} ({statRows.length})</DialogTitle>
          </DialogHeader>

          {statRows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Nothing in this group.</p>
          ) : statModal?.key === 'subjects' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Subject</TableHead>
                  <TableHead className={TH}>Chapters</TableHead>
                  <TableHead className={TH}>Recorded</TableHead>
                  <TableHead className={TH}>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statRows.map((s) => (
                  <TableRow key={s.nios_stream_subject_id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{s.subject_name}</TableCell>
                    <TableCell className="tabular-nums text-slate-700 dark:text-slate-300">{s.total}</TableCell>
                    <TableCell className="tabular-nums text-green-600 dark:text-green-400">{s.recorded}</TableCell>
                    <TableCell className="tabular-nums text-amber-600 dark:text-amber-400">{s.pending}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Subject</TableHead>
                  <TableHead className={TH}>Chapter</TableHead>
                  <TableHead className={TH}>Recorded</TableHead>
                  <TableHead className={TH}>Upload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statRows.map((r) => (
                  <TableRow
                    key={r.chapter_id}
                    className="cursor-pointer"
                    onClick={() => { setStatModal(null); openDetails(r); }}
                  >
                    <TableCell className="text-sm text-slate-600 dark:text-slate-300">{r.subject_name}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.chapter_title}</TableCell>
                    <TableCell className="text-sm">
                      {r.recorded
                        ? <span className="text-green-600 dark:text-green-400">Yes</span>
                        : <span className="text-slate-400">No</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {!r.recorded
                        ? <span className="text-slate-400">—</span>
                        : r.recorded_not_uploaded
                          ? <span className="text-amber-600 dark:text-amber-400">Pending</span>
                          : <span className="text-green-600 dark:text-green-400">Uploaded</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatModal(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Recording — {editorChapter?.chapter_title}</DialogTitle></DialogHeader>
          <form onSubmit={saveRecording} className="space-y-4">
            {/* The primary decision in this form — give it a panel of its own that
                visibly changes state, instead of a bare switch on the label row. */}
            <label
              htmlFor="is_recorded"
              className={`flex items-center justify-between gap-4 rounded-lg border p-3 cursor-pointer transition-colors ${
                rec.is_recorded
                  ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${rec.is_recorded ? 'text-green-800 dark:text-green-200' : 'text-slate-800 dark:text-slate-200'}`}>
                  This chapter is recorded
                </p>
                <p className={`text-xs mt-0.5 ${rec.is_recorded ? 'text-green-700/80 dark:text-green-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                  {rec.is_recorded ? 'Counted as recorded in the report.' : 'Turn on once the session has been captured.'}
                </p>
              </div>
              <Switch
                checked={rec.is_recorded}
                onCheckedChange={(v) => setRec({ ...rec, is_recorded: v })}
                id="is_recorded"
                className="shrink-0 data-[state=checked]:bg-green-600"
              />
            </label>

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
