import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import client from '@/api/client';

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  university_id: '', stream_id: '', batch_id: '', academic_year_id: '', semester_id: '', subject_id: '',
  faculty_id: '', date_from: '', date_to: '',
  class_status: '', class_mode: '',
};

// Radix Select has no empty value, so "All" carries a sentinel we map back to ''.
const ALL = '__all';
const clean = (v) => (v === ALL ? '' : v);

const MODE_LABELS = { online: 'Live / Online', offline: 'Offline' };

function pct(num, den) {
  if (!den || Number(den) === 0) return null;
  return `${Math.round((Number(num) / Number(den)) * 100)}%`;
}

function StatCard({ label, value, sub, subLabel, color = 'slate' }) {
  const colors = {
    green:  'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red:    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    slate:  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color] || colors.slate}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value ?? 0}</p>
      {sub != null && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {subLabel ? `${subLabel}: ` : ''}{sub}
        </p>
      )}
    </div>
  );
}


const STATUS_STYLES = {
  taken:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  not_taken: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  scheduled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};
const STATUS_LABELS = { taken: 'Taken', not_taken: 'Not Taken', scheduled: 'Scheduled' };

export default function ClassOverviewPage() {
  // Cascade reference data
  const [universities, setUniversities] = useState([]);
  const [streams, setStreams] = useState([]);
  const [batches, setBatches] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [facultyList, setFacultyList] = useState([]);

  // Form (pending) state
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });

  // Result state
  const [summary, setSummary] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([client.get('/universities'), client.get('/faculty')])
      .then(([uRes, fRes]) => {
        setUniversities(uRes.data);
        setFacultyList(fRes.data);
      })
      .catch(() => toast.error('Failed to load reference data.'));
    loadSubjects({});
  }, []);

  // Subjects are always filterable — narrowed to the syllabus of whatever level is
  // selected, or the full list when nothing is. Both sources are normalised to the
  // subject id that /classes filters on.
  async function loadSubjects({ university_id, stream_id, academic_year_id, semester_id }) {
    try {
      if (semester_id || academic_year_id) {
        const q = semester_id ? `semester_id=${semester_id}` : `academic_year_id=${academic_year_id}`;
        const res = await client.get(`/academic-year-subjects?${q}`);
        setSubjectOptions(res.data.map(s => ({
          value: String(s.subject_id),
          label: `${s.subject_name}${s.subject_code ? ` (${s.subject_code})` : ''}`,
        })));
        return;
      }
      const q = new URLSearchParams();
      if (stream_id) q.set('stream_id', stream_id);
      else if (university_id) q.set('university_id', university_id);
      const res = await client.get(`/subjects?${q.toString()}`);
      setSubjectOptions(res.data.map(s => ({
        value: String(s.id),
        label: `${s.name}${s.subject_code ? ` (${s.subject_code})` : ''}`,
      })));
    } catch { setSubjectOptions([]); }
  }

  // ── Cascade handlers ──────────────────────────────────────────────────────

  async function onUniChange(raw) {
    const v = clean(raw);
    setFilters(f => ({ ...f, university_id: v, stream_id: '', batch_id: '', academic_year_id: '', semester_id: '', subject_id: '' }));
    setStreams([]); setBatches([]); setAcademicYears([]); setSemesters([]);
    loadSubjects({ university_id: v });
    if (v) {
      try { const res = await client.get(`/streams?university_id=${v}`); setStreams(res.data); } catch { /**/ }
    }
  }

  async function onStreamChange(raw) {
    const v = clean(raw);
    const uniId = filters.university_id;
    setFilters(f => ({ ...f, stream_id: v, batch_id: '', academic_year_id: '', semester_id: '', subject_id: '' }));
    setBatches([]); setAcademicYears([]); setSemesters([]);
    loadSubjects({ university_id: uniId, stream_id: v });
    if (v) {
      try {
        // Academic years are stream-level now, so load them with the batches.
        const [bRes, yRes] = await Promise.all([
          client.get(`/batches?university_id=${uniId}&stream_id=${v}`),
          client.get(`/academic-years?stream_id=${v}`),
        ]);
        setBatches(bRes.data);
        setAcademicYears(yRes.data);
      } catch { /**/ }
    }
  }

  function onBatchChange(raw) {
    setFilters(f => ({ ...f, batch_id: clean(raw) }));
  }

  async function onYearChange(raw) {
    const v = clean(raw);
    setFilters(f => ({ ...f, academic_year_id: v, semester_id: '', subject_id: '' }));
    setSemesters([]);
    if (!v) {
      loadSubjects({ university_id: filters.university_id, stream_id: filters.stream_id });
      return;
    }
    try {
      // Semesters are optional per year — the picker only appears when this year
      // actually has them.
      const semRes = await client.get(`/semesters?academic_year_id=${v}`);
      setSemesters(semRes.data);
    } catch { /**/ }
    loadSubjects({ academic_year_id: v });
  }

  async function onSemesterChange(raw) {
    const v = clean(raw);
    setFilters(f => ({ ...f, semester_id: v, subject_id: '' }));
    loadSubjects(v ? { semester_id: v } : { academic_year_id: filters.academic_year_id });
  }

  // ── Query building ────────────────────────────────────────────────────────

  function buildQueryString(f) {
    const q = new URLSearchParams();
    const simple = ['university_id','stream_id','batch_id','academic_year_id','semester_id','subject_id',
                     'faculty_id','date_from','date_to','class_status','class_mode'];
    simple.forEach(k => { if (f[k]) q.set(k, f[k]); });
    return q.toString();
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async function applyFilters() {
    setLoading(true);
    setPage(1);
    try {
      const q = buildQueryString(filters);
      const [sumRes, classRes] = await Promise.all([
        client.get(`/classes/summary?${q}`),
        client.get(`/classes?${q}`),
      ]);
      setSummary(sumRes.data);
      setClasses(classRes.data);
      setHasLoaded(true);
    } catch {
      toast.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setFilters({ ...EMPTY_FILTERS });
    setStreams([]); setBatches([]); setAcademicYears([]); setSemesters([]);
    loadSubjects({});
    setSummary(null); setClasses([]); setHasLoaded(false);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    try {
      const q = buildQueryString(filters);
      const res = await client.get(`/reports/export?type=class_overview&${q}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'class_overview.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed.');
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(classes.length / PAGE_SIZE));
  const paged = classes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Class Overview</h1>

      {/* ── Filter Panel ── */}
      <Card>
        <CardContent className="pt-4 space-y-4">

          {/* Row 1: curriculum cascade */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">University</Label>
              <Select value={filters.university_id} onValueChange={onUniChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {universities.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Stream / Course</Label>
              <Select value={filters.stream_id} onValueChange={onStreamChange} disabled={!filters.university_id}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {streams.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Batch</Label>
              <Select value={filters.batch_id} onValueChange={onBatchChange} disabled={!filters.stream_id}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {batches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Academic Year</Label>
              {/* Academic years hang off the stream, so a batch isn't needed here. */}
              <Select value={filters.academic_year_id} onValueChange={onYearChange} disabled={!filters.stream_id}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {academicYears.map(y => <SelectItem key={y.id} value={String(y.id)}>{y.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Only years that actually have semesters get a semester picker. */}
            {semesters.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Semester</Label>
                <Select value={filters.semester_id} onValueChange={onSemesterChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Select
                value={filters.subject_id}
                onValueChange={v => setFilters(f => ({ ...f, subject_id: clean(v) }))}
                disabled={subjectOptions.length === 0}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {subjectOptions.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: detail filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Faculty</Label>
              <Select value={filters.faculty_id} onValueChange={v => setFilters(f => ({ ...f, faculty_id: clean(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {facultyList.map(fc => <SelectItem key={fc.id} value={String(fc.id)}>{fc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Class Status</Label>
              <Select value={filters.class_status} onValueChange={v => setFilters(f => ({ ...f, class_status: clean(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="taken">Taken</SelectItem>
                  <SelectItem value="not_taken">Not Taken</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={filters.class_mode} onValueChange={v => setFilters(f => ({ ...f, class_mode: clean(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="online">Live / Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </Button>
            <Button variant="outline" onClick={clearAll}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ── */}
      {summary && (
        <>
          {/* Primary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total Classes"
              value={summary.total}
              sub={`${summary.total_hours} hrs`}
              color="slate"
            />
            <StatCard
              label="Taken"
              value={summary.taken}
              sub={pct(summary.taken, summary.total)}
              subLabel="completion"
              color="green"
            />
            <StatCard
              label="Not Taken"
              value={summary.not_taken}
              color="red"
            />
            <StatCard
              label="Scheduled"
              value={summary.scheduled}
              color="amber"
            />
          </div>

        </>
      )}

      {/* ── Detail Table ── */}
      {hasLoaded && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-900 dark:text-slate-100">
              Classes
              {classes.length > 0 && <span className="ml-2 text-slate-400 font-normal text-sm">({classes.length})</span>}
            </CardTitle>
            {classes.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleExport}>Export CSV</Button>
            )}
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No classes match the selected filters.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Faculty</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Subject</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">University / Batch</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Hrs</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Mode</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.map(cls => (
                        <TableRow key={cls.id}>
                          <TableCell className="text-sm whitespace-nowrap">{cls.date}</TableCell>
                          <TableCell className="text-sm">{cls.faculty_name || '—'}</TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate">{cls.subject_name || '—'}</TableCell>
                          <TableCell className="text-sm">
                            <div className="leading-tight">
                              <span>{cls.university_name || '—'}</span>
                              {cls.batch_name && <span className="block text-xs text-slate-400">{cls.batch_name}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{cls.total_hours ?? '—'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{MODE_LABELS[cls.class_mode] || '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[cls.class_status] || 'bg-slate-100 text-slate-600'}`}>
                              {STATUS_LABELS[cls.class_status] || cls.class_status || '—'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-slate-500 dark:text-slate-400">
                    <span>
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, classes.length)} of {classes.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                      <span>{page} / {totalPages}</span>
                      <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prompt before first load */}
      {!hasLoaded && !loading && (
        <div className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
          Set filters above and click <strong>Apply</strong> to load the overview.
        </div>
      )}
    </div>
  );
}
