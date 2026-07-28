import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import StatusBadge from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';
import { to12h } from '@/lib/time';
import { takenLockReason } from '@/lib/editWindow';
import LockedBadge from '@/components/LockedBadge';
import { SkeletonCards } from '@/components/Skeletons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// ── Date helpers ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(ref) {
  const start = getWeekStart(ref);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getMonthGrid(ref) {
  const gridStart = getWeekStart(new Date(ref.getFullYear(), ref.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Normalize a week_start_date coming from the API (Date object, ISO string, or
// plain date) to 'YYYY-MM-DD' using UTC parts so it isn't shifted by timezone.
function normWeekStart(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val.slice(0, 10);
  const d = new Date(val);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isToday(date) {
  return toDateStr(date) === toDateStr(new Date());
}

const emptySlotForm = { day_of_week: '', start_time: '', end_time: '', faculty_id: '', subject_id: '', notes: '' };

// A "common class" is one slot shared by several batches. The picker offers the
// batches of every stream (in this university) whose syllabus includes the chosen
// subject — the same rule the Classes page uses for a common-subject fan-out.
function CommonBatchPicker({ subjectId, streams, batches, selected, onToggle }) {
  if (!subjectId) {
    return <p className="text-xs text-slate-400">Pick a subject to see the batches of every stream that shares it.</p>;
  }
  if (streams.length === 0) {
    return <p className="text-xs text-slate-400">This subject isn't shared with any other stream in this university.</p>;
  }
  return (
    <div className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 max-h-48 overflow-y-auto">
      {streams.map((st) => {
        const streamBatches = batches.filter((b) => String(b.stream_id) === String(st.stream_id));
        return (
          <div key={st.stream_id} className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{st.stream_name}</p>
            {streamBatches.length === 0
              ? <p className="text-xs text-slate-400 pl-1">No batches in this stream.</p>
              : streamBatches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer pl-1 text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.includes(String(b.id))}
                      onChange={() => onToggle(b.id)}
                    />
                    {b.name}
                  </label>
                ))
            }
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TimetableCalendarPage() {
  const { universityId, streamId, batchId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();

  // Academic year / semester selector
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');
  // Whether the semester list for the selected year has been fetched — lets the
  // drill know whether to show the semester step or skip straight to the calendar.
  const [semResolved, setSemResolved] = useState(false);
  // Whether the initial reference data (faculty, academic years) has loaded, so the
  // year step shows a skeleton instead of flashing "no years" while fetching.
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false);

  // Reference data
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Timetable details for this batch, keyed by week_start_date ('YYYY-MM-DD')
  const [timetableByWeek, setTimetableByWeek] = useState({});

  // Breadcrumb names
  const [universityName, setUniversityName] = useState('');
  const [streamName, setStreamName] = useState('');
  const [batchName, setBatchName] = useState('');

  // Calendar navigation
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Add slot dialog
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [savingSlot, setSavingSlot] = useState(false);

  // Common-class fan-out: the streams (same university) sharing the chosen
  // subject, every batch in this university, and the batches ticked to share with.
  const [commonClass, setCommonClass] = useState(false);
  const [commonStreams, setCommonStreams] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [sharedBatchIds, setSharedBatchIds] = useState([]);

  // Same three, for the edit dialog — editing can change who a slot is shared with.
  const [editCommonClass, setEditCommonClass] = useState(false);
  const [editCommonStreams, setEditCommonStreams] = useState([]);
  const [editSharedBatchIds, setEditSharedBatchIds] = useState([]);

  // Edit slot dialog
  const [editSlotOpen, setEditSlotOpen] = useState(false);
  const [editSlotTarget, setEditSlotTarget] = useState(null); // { slot, timetableId }
  const [editSlotForm, setEditSlotForm] = useState(emptySlotForm);
  const [savingEditSlot, setSavingEditSlot] = useState(false);

  const [busy, setBusy] = useState(false);

  const weekStartStr = toDateStr(getWeekStart(currentDate));
  const currentTimetable = timetableByWeek[weekStartStr] || null;

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadDropdowns() {
    try {
      const [fRes, ayRes] = await Promise.all([
        client.get('/faculty'),
        // Academic years belong to the stream now, not the batch.
        client.get(`/academic-years?stream_id=${streamId}`),
      ]);
      setFaculty(fRes.data);
      setAcademicYears(ayRes.data);
      // Load subjects for the currently selected year/semester (or all for this university)
      await loadSubjects(selectedYearId, selectedSemesterId);
    } catch {
      toast.error('Failed to load reference data.');
    } finally {
      setDropdownsLoaded(true);
    }
  }

  async function loadSubjects(yearId, semId) {
    try {
      const params = { university_id: universityId };
      if (semId) params.semester_id = semId;
      else if (yearId) params.academic_year_id = yearId;
      const res = await client.get('/subjects', { params });
      setSubjects(res.data);
    } catch { /* non-critical */ }
  }

  const loadTimetables = useCallback(async () => {
    try {
      // A timetable is one grid per (batch, week); the selected year/semester is
      // context for the subject list and for classes added here, not a filter that
      // would hide week timetables created elsewhere (e.g. from the Classes page).
      const params = { batch_id: batchId };
      const res = await client.get('/timetables', { params });
      const batchTTs = res.data.filter((t) => String(t.university_id) === universityId);

      if (batchTTs[0]) {
        setUniversityName(batchTTs[0].university_name || '');
        setBatchName(batchTTs[0].batch_name || '');
      } else {
        try {
          const [uRes, bRes] = await Promise.all([
            client.get('/universities'),
            client.get('/batches', { params: { university_id: universityId } }),
          ]);
          setUniversityName(uRes.data.find((u) => String(u.id) === universityId)?.name || '');
          setBatchName(bRes.data.find((b) => String(b.id) === batchId)?.name || '');
        } catch { /* non-critical */ }
      }

      const details = await Promise.all(batchTTs.map((t) => client.get(`/timetables/${t.id}`)));
      const map = {};
      details.forEach((r) => {
        const wk = normWeekStart(r.data.week_start_date);
        if (!wk) return;
        // One timetable per week per batch; keep the first if duplicates exist.
        if (!map[wk]) map[wk] = r.data;
      });
      setTimetableByWeek(map);
    } catch {
      toast.error('Failed to load timetables.');
    }
  }, [universityId, batchId]);

  useEffect(() => {
    loadDropdowns();
    loadTimetables();
  }, [universityId, batchId, loadTimetables]);

  // Resolve the stream name for the breadcrumb.
  useEffect(() => {
    if (!streamId) return;
    client
      .get('/streams', { params: { university_id: universityId } })
      .then((r) => setStreamName(r.data.find((s) => String(s.id) === streamId)?.name || ''))
      .catch(() => { /* non-critical */ });
  }, [universityId, streamId]);

  // ── Year / semester selection ─────────────────────────────────────────────────

  async function handleYearChange(yearId) {
    setSelectedYearId(yearId);
    setSelectedSemesterId('');
    setSemesters([]);
    setSemResolved(false);
    setTimetableByWeek({});
    if (yearId) {
      const res = await client.get(`/semesters?academic_year_id=${yearId}`);
      setSemesters(res.data);
      setSemResolved(true);
      await loadSubjects(yearId, '');
    } else {
      await loadSubjects('', '');
    }
  }

  async function handleSemesterChange(semId) {
    setSelectedSemesterId(semId);
    setTimetableByWeek({});
    await loadSubjects(selectedYearId, semId);
  }

  // ── Drill-down step (Batch → Year → Sem → Calendar) ──────────────────────────
  // Which step to show: pick a year, then a semester (only when the year has
  // them), before the calendar/add-slot is available.
  const drillStep = !selectedYearId
    ? 'year'
    : !semResolved
      ? 'loading'
      : (semesters.length > 0 && !selectedSemesterId)
        ? 'semester'
        : 'calendar';

  // Breadcrumb: clicking Batch clears year+sem; clicking Year clears sem.
  function backToYearStep() {
    setSelectedYearId('');
    setSelectedSemesterId('');
    setSemesters([]);
    setSemResolved(false);
    setTimetableByWeek({});
    loadSubjects('', '');
  }
  function backToSemesterStep() {
    setSelectedSemesterId('');
    setTimetableByWeek({});
    loadSubjects(selectedYearId, '');
  }

  const selectedYearName = academicYears.find((y) => String(y.id) === selectedYearId)?.name || '';
  const selectedSemesterName = semesters.find((s) => String(s.id) === selectedSemesterId)?.name || '';

  // ── Calendar navigation ──────────────────────────────────────────────────────

  function navigate_(dir) {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  function viewLabel() {
    if (view === 'week') {
      const [mon, sun] = [getWeekDates(currentDate)[0], getWeekDates(currentDate)[6]];
      if (mon.getMonth() === sun.getMonth()) {
        return `${MONTH_NAMES[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}, ${mon.getFullYear()}`;
      }
      return `${MONTH_NAMES[mon.getMonth()]} ${mon.getDate()} – ${MONTH_NAMES[sun.getMonth()]} ${sun.getDate()}, ${sun.getFullYear()}`;
    }
    return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }

  function slotsForWeekDay(tt, dayName) {
    return (tt?.slots || []).filter((s) => s.day_of_week === dayName);
  }

  // ── Create the week's timetable on demand ────────────────────────────────────

  async function ensureWeekTimetable() {
    if (currentTimetable) return currentTimetable;
    const yearLabel = academicYears.find((y) => String(y.id) === selectedYearId)?.name || '';
    const semLabel  = semesters.find((s) => String(s.id) === selectedSemesterId)?.name || '';
    const contextLabel = [yearLabel, semLabel].filter(Boolean).join(' · ');
    const label = `Week of ${weekStartStr}${batchName ? ` – ${batchName}` : ''}${contextLabel ? ` · ${contextLabel}` : ''}`;
    const res = await client.post('/timetables', {
      name: label,
      university_id: universityId,
      batch_id: batchId,
      week_start_date: weekStartStr,
      academic_year_id: selectedYearId || null,
      semester_id: selectedSemesterId || null,
    });
    await loadTimetables();
    return res.data;
  }

  async function handleCreateWeek() {
    setBusy(true);
    try {
      await ensureWeekTimetable();
      toast.success('Timetable created for this week.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create timetable.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTimetable() {
    if (!currentTimetable) return;
    const ok = await confirm({
      title: 'Delete timetable?',
      description: `Are you sure you want to delete this week's timetable? Its ${currentTimetable.slots?.length || 0} slot(s) and the class entries they created will be removed too. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await client.delete(`/timetables/${currentTimetable.id}`);
      const gone = res.data?.classes_removed || 0;
      toast.success(gone ? `Timetable deleted — ${gone} class entr${gone > 1 ? 'ies' : 'y'} removed.` : 'Timetable deleted.');
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete.');
    }
  }

  // ── Slot status ───────────────────────────────────────────────────────────────

  async function setSlotStatus(slot, status) {
    try {
      await client.put(`/timetables/${slot._timetableId}/slots/${slot.id}`, { class_taken_status: status });
      toast.success(
        status === 'taken' ? 'Marked taken — class added to the class list.'
          : status === 'not_taken' ? 'Marked not taken.' : 'Marked scheduled.'
      );
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    }
  }

  // ── Add slot ──────────────────────────────────────────────────────────────────

  function openAddSlot(prefillDay) {
    setSlotForm({ ...emptySlotForm, day_of_week: prefillDay || '' });
    setCommonClass(false);
    setCommonStreams([]);
    setSharedBatchIds([]);
    setSlotOpen(true);
  }

  // Streams (same university) whose syllabus includes this subject — those are the
  // batches worth offering to share with. Returns the list so callers can decide
  // which dialog's state to fill.
  async function fetchCommonStreams(subjectId) {
    if (!subjectId) return [];
    const [aysRes, bRes] = await Promise.all([
      client.get(`/academic-year-subjects?subject_id=${subjectId}`),
      allBatches.length ? Promise.resolve({ data: allBatches }) : client.get('/batches', { params: { university_id: universityId } }),
    ]);
    setAllBatches(bRes.data);
    const seen = new Set();
    const list = [];
    for (const p of aysRes.data) {
      if (String(p.university_id) !== String(universityId)) continue;
      if (seen.has(String(p.stream_id))) continue;
      seen.add(String(p.stream_id));
      list.push({ stream_id: p.stream_id, stream_name: p.stream_name });
    }
    return list;
  }

  async function loadCommonStreams(subjectId) {
    try { setCommonStreams(await fetchCommonStreams(subjectId)); }
    catch { setCommonStreams([]); }
  }

  async function loadEditCommonStreams(subjectId) {
    try { setEditCommonStreams(await fetchCommonStreams(subjectId)); }
    catch { setEditCommonStreams([]); }
  }

  async function handleCommonToggle(v) {
    setCommonClass(v);
    setSharedBatchIds([]);
    if (v) await loadCommonStreams(slotForm.subject_id);
    else setCommonStreams([]);
  }

  async function handleSlotSubjectChange(v) {
    setSlotForm((f) => ({ ...f, subject_id: v }));
    if (commonClass) {
      setSharedBatchIds([]);
      await loadCommonStreams(v);
    }
  }

  function toggleSharedBatch(id) {
    const key = String(id);
    setSharedBatchIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  async function handleAddSlot(e) {
    e.preventDefault();
    setSavingSlot(true);
    try {
      const tt = await ensureWeekTimetable();
      // batch_ids fans the slot out to those batches' grids for the same week and
      // links the copies, so a later edit or delete applies to all of them.
      const payload = commonClass && sharedBatchIds.length > 0
        ? { ...slotForm, batch_ids: sharedBatchIds }
        : slotForm;
      const res = await client.post(`/timetables/${tt.id}/slots`, payload);
      const shared = res.data?.shared_count || 1;
      toast.success(shared > 1 ? `Common slot added to ${shared} batches.` : 'Slot added.');
      setSlotOpen(false);
      setSlotForm(emptySlotForm);
      setCommonClass(false); setCommonStreams([]); setSharedBatchIds([]);
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleDeleteSlot(slot) {
    const shared = slot.shared_batches?.length || 0;
    const ok = await confirm({
      title: shared > 0 ? 'Remove common slot?' : 'Remove slot?',
      description: shared > 0
        ? `This is a common class shared with ${slot.shared_batches.join(', ')}. Removing it will remove it from all ${shared + 1} batches, along with the class entries it created.`
        : 'Removing this slot also removes the class entry it created. Are you sure?',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await client.delete(`/timetables/${slot._timetableId}/slots/${slot.id}`);
      const gone = res.data?.classes_removed || 0;
      toast.success(gone ? `Slot removed — ${gone} class entr${gone > 1 ? 'ies' : 'y'} removed.` : 'Slot removed.');
      await loadTimetables();
    } catch {
      toast.error('Failed to remove slot.');
    }
  }

  // ── Edit slot ─────────────────────────────────────────────────────────────────

  function openEditSlot(slot) {
    setEditSlotTarget({ slot, timetableId: slot._timetableId });
    setEditSlotForm({
      day_of_week: slot.day_of_week || '',
      start_time: slot.start_time?.slice(0, 5) || '',
      end_time: slot.end_time?.slice(0, 5) || '',
      faculty_id: slot.faculty_id ? String(slot.faculty_id) : '',
      subject_id: slot.subject_id ? String(slot.subject_id) : '',
      notes: slot.notes || '',
    });
    // Prefill the sharing state from the slot's current group.
    const shared = (slot.shared_batch_ids || []).map(String);
    setEditSharedBatchIds(shared);
    setEditCommonClass(shared.length > 0);
    setEditCommonStreams([]);
    if (slot.subject_id) loadEditCommonStreams(String(slot.subject_id));
    setEditSlotOpen(true);
  }

  async function handleEditCommonToggle(v) {
    setEditCommonClass(v);
    if (v) await loadEditCommonStreams(editSlotForm.subject_id);
    else setEditSharedBatchIds([]);
  }

  async function handleEditSubjectChange(v) {
    setEditSlotForm((f) => ({ ...f, subject_id: v }));
    if (editCommonClass) {
      setEditSharedBatchIds([]);
      await loadEditCommonStreams(v);
    }
  }

  function toggleEditSharedBatch(id) {
    const key = String(id);
    setEditSharedBatchIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  async function handleEditSlot(e) {
    e.preventDefault();
    if (!editSlotTarget) return;
    setSavingEditSlot(true);
    try {
      // batch_ids is the full desired set of OTHER batches; sending [] un-shares.
      const res = await client.put(
        `/timetables/${editSlotTarget.timetableId}/slots/${editSlotTarget.slot.id}`,
        { ...editSlotForm, batch_ids: editCommonClass ? editSharedBatchIds : [] }
      );
      const shared = res.data?.shared_count || 1;
      toast.success(shared > 1 ? `Common slot updated across ${shared} batches.` : 'Slot updated.');
      setEditSlotOpen(false);
      setEditSlotTarget(null);
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update slot.');
    } finally {
      setSavingEditSlot(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const weekDates = getWeekDates(currentDate);
  const monthGrid = getMonthGrid(currentDate);

  return (
    <div className="space-y-4">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate('/timetable')}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          Timetable
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <button
          onClick={() => navigate(`/timetable/${universityId}`)}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          {universityName || '...'}
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <button
          onClick={() => navigate(`/timetable/${universityId}/${streamId}`)}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          {streamName || '...'}
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        {selectedYearId ? (
          <button
            onClick={backToYearStep}
            className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {batchName || '...'}
          </button>
        ) : (
          <span className="font-semibold text-slate-900 dark:text-slate-100">{batchName || '...'}</span>
        )}
        {selectedYearId && (
          <>
            <span className="text-slate-300 dark:text-slate-600">›</span>
            {selectedSemesterId ? (
              <button
                onClick={backToSemesterStep}
                className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {selectedYearName}
              </button>
            ) : (
              <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedYearName}</span>
            )}
          </>
        )}
        {selectedSemesterId && (
          <>
            <span className="text-slate-300 dark:text-slate-600">›</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedSemesterName}</span>
          </>
        )}
      </div>

      {/* ── Drill step: pick Academic Year ── */}
      {drillStep === 'year' && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Select Academic Year</h2>
          {!dropdownsLoaded ? (
            <SkeletonCards count={3} />
          ) : academicYears.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No academic years defined for this stream.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {academicYears.map((y) => (
                <button
                  key={y.id}
                  onClick={() => handleYearChange(String(y.id))}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{y.name}</p>
                    <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 text-xl leading-none shrink-0">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Drill step: loading semesters ── */}
      {drillStep === 'loading' && (
        <SkeletonCards count={3} />
      )}

      {/* ── Drill step: pick Semester (only when the year has semesters) ── */}
      {drillStep === 'semester' && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Select Semester</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {semesters.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSemesterChange(String(s.id))}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{s.name}</p>
                  <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 text-xl leading-none shrink-0">›</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {drillStep === 'calendar' && (
      <>
      {/* ── Control bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {currentTimetable ? (
          <>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {currentTimetable.name}
            </span>
            <Button size="sm" variant="outline"
              onClick={() => openAddSlot('')}>
              Add Slot
            </Button>
            {isAdmin() && (
              <Button size="sm" variant="ghost"
                className="text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900"
                onClick={handleDeleteTimetable}>
                Delete This Week
              </Button>
            )}
          </>
        ) : view === 'week' ? (
          <Button size="sm" onClick={handleCreateWeek} disabled={busy}>
            + Create timetable for this week
          </Button>
        ) : null}

        <div className="flex-1" />

        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
          {['week', 'month'].map((v) => (
            <button key={v}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                view === v
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => navigate_(-1)} className="px-2.5">‹</Button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-52 text-center select-none">
            {viewLabel()}
          </span>
          <Button size="sm" variant="outline" onClick={() => navigate_(1)} className="px-2.5">›</Button>
        </div>

        <Button size="sm" variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
      </div>

      {/* ── Weekly view ── */}
      {view === 'week' && (
        <WeeklyView
          dates={weekDates}
          timetable={currentTimetable}
          slotsForWeekDay={slotsForWeekDay}
          onAddSlot={openAddSlot}
          onEditSlot={openEditSlot}
          onSetStatus={setSlotStatus}
          onDeleteSlot={handleDeleteSlot}
        />
      )}

      {/* ── Monthly view ── */}
      {view === 'month' && (
        <MonthlyView
          currentDate={currentDate}
          grid={monthGrid}
          timetableByWeek={timetableByWeek}
          onWeekClick={(date) => { setCurrentDate(date); setView('week'); }}
        />
      )}
      </>
      )}

      {/* ── Add Slot dialog ── */}
      <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Slot</DialogTitle></DialogHeader>
          <form onSubmit={handleAddSlot} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Day *</Label>
              <Select value={slotForm.day_of_week}
                onValueChange={(v) => setSlotForm({ ...slotForm, day_of_week: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={slotForm.start_time}
                  onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={slotForm.end_time}
                  onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Faculty</Label>
              <Select value={slotForm.faculty_id}
                onValueChange={(v) => setSlotForm({ ...slotForm, faculty_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select value={slotForm.subject_id} onValueChange={handleSlotSubjectChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Common class — the same slot in several batches' grids for this week. */}
            <div className={`rounded-lg border p-3 space-y-2 transition-colors ${
              commonClass
                ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
            }`}>
              <label htmlFor="common_class" className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className={`text-sm font-semibold ${commonClass ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
                    Common class — also add to other batches
                  </p>
                  <p className={`text-xs mt-0.5 ${commonClass ? 'text-indigo-700/80 dark:text-indigo-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    {commonClass
                      ? 'One shared slot — editing or removing it later applies to every batch.'
                      : 'Off — this slot belongs to this batch only.'}
                  </p>
                </div>
                <Switch checked={commonClass} onCheckedChange={handleCommonToggle} id="common_class" className="shrink-0" />
              </label>

              {commonClass && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs">
                    Share with <span className="font-normal text-slate-400">({sharedBatchIds.length} selected)</span>
                  </Label>
                  <CommonBatchPicker
                    subjectId={slotForm.subject_id}
                    streams={commonStreams}
                    batches={allBatches.filter((b) => String(b.id) !== String(batchId))}
                    selected={sharedBatchIds}
                    onToggle={toggleSharedBatch}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={slotForm.notes}
                onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSlotOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={savingSlot || !slotForm.day_of_week || (commonClass && sharedBatchIds.length === 0)}
              >
                {savingSlot
                  ? 'Adding…'
                  : commonClass && sharedBatchIds.length > 0
                    ? `Add to ${sharedBatchIds.length + 1} batches`
                    : 'Add Slot'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Slot dialog ── */}
      <Dialog open={editSlotOpen} onOpenChange={setEditSlotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Slot</DialogTitle></DialogHeader>
          {editSlotTarget?.slot?.shared_batches?.length > 0 && (
            <p className="text-xs rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 p-2">
              ⧉ Common class — these changes also apply to {editSlotTarget.slot.shared_batches.join(', ')}.
            </p>
          )}
          <form onSubmit={handleEditSlot} className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label>Day *</Label>
              <Select value={editSlotForm.day_of_week}
                onValueChange={(v) => setEditSlotForm({ ...editSlotForm, day_of_week: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={editSlotForm.start_time}
                  onChange={(e) => setEditSlotForm({ ...editSlotForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={editSlotForm.end_time}
                  onChange={(e) => setEditSlotForm({ ...editSlotForm, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Faculty</Label>
              <Select value={editSlotForm.faculty_id}
                onValueChange={(v) => setEditSlotForm({ ...editSlotForm, faculty_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select value={editSlotForm.subject_id} onValueChange={handleEditSubjectChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Sharing can be changed here: tick to add a batch, untick to drop it. */}
            <div className={`rounded-lg border p-3 space-y-2 transition-colors ${
              editCommonClass
                ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
            }`}>
              <label htmlFor="edit_common_class" className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className={`text-sm font-semibold ${editCommonClass ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
                    Common class — shared with other batches
                  </p>
                  <p className={`text-xs mt-0.5 ${editCommonClass ? 'text-indigo-700/80 dark:text-indigo-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    {editCommonClass
                      ? 'Untick a batch to remove this slot from it; tick one to add it.'
                      : 'Off — saving will remove this slot from every other batch.'}
                  </p>
                </div>
                <Switch checked={editCommonClass} onCheckedChange={handleEditCommonToggle} id="edit_common_class" className="shrink-0" />
              </label>

              {editCommonClass && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs">
                    Shared with <span className="font-normal text-slate-400">({editSharedBatchIds.length} selected)</span>
                  </Label>
                  <CommonBatchPicker
                    subjectId={editSlotForm.subject_id}
                    streams={editCommonStreams}
                    batches={allBatches.filter((b) => String(b.id) !== String(batchId))}
                    selected={editSharedBatchIds}
                    onToggle={toggleEditSharedBatch}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={editSlotForm.notes}
                onChange={(e) => setEditSlotForm({ ...editSlotForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditSlotOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={savingEditSlot || (editCommonClass && editSharedBatchIds.length === 0)}
              >
                {savingEditSlot ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── SlotCard ──────────────────────────────────────────────────────────────────

function SlotCard({ slot, onEdit, onSetStatus, onDelete }) {
  const { isAdmin } = useAuth();
  const status = slot.class_taken_status || 'scheduled';
  // A slot whose class is marked taken closes for editing after its window; the
  // API refuses these anyway, so don't offer actions that would just 403.
  const lock = takenLockReason(status, slot._date, isAdmin());
  const border = status === 'taken'
    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
    : status === 'not_taken'
      ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${border}`}>
      {/* Status + actions on their own row so the faculty/subject names below get
          the full card width and stay readable instead of being squeezed. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusBadge status={status} />
          <LockedBadge reason={lock} />
        </div>

        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors text-base leading-none"
              title="Actions"
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status !== 'taken' && (
                <DropdownMenuItem disabled={!!lock} onClick={() => onSetStatus(slot, 'taken')}>
                  Mark taken
                </DropdownMenuItem>
              )}
              {status !== 'not_taken' && (
                <DropdownMenuItem
                  disabled={!!lock}
                  onClick={() => onSetStatus(slot, 'not_taken')}
                  className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
                >
                  Mark not taken
                </DropdownMenuItem>
              )}
              {status !== 'scheduled' && (
                <DropdownMenuItem disabled={!!lock} onClick={() => onSetStatus(slot, 'scheduled')}>
                  Reset to scheduled
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!!lock} onClick={() => onEdit(slot)}>
                Edit slot
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!!lock}
                onClick={() => onDelete(slot)}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                Remove slot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-tight break-words">
          {slot.faculty_name || '—'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{slot.subject_name || '—'}</p>
      </div>

      {(slot.start_time || slot.end_time) && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {to12h(slot.start_time?.slice(0, 5))} – {to12h(slot.end_time?.slice(0, 5))}
        </p>
      )}
      {slot.shared_batches?.length > 0 && (
        <p
          className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
          title={`Shared with: ${slot.shared_batches.join(', ')}`}
        >
          ⧉ Shared × {slot.shared_batches.length + 1}
        </p>
      )}
      {slot.notes && (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">{slot.notes}</p>
      )}
    </div>
  );
}

// ── WeeklyView ────────────────────────────────────────────────────────────────

function WeeklyView({ dates, timetable, slotsForWeekDay, onAddSlot, onEditSlot, onSetStatus, onDeleteSlot }) {
  if (!timetable) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No timetable for this week. Use “Create timetable for this week” above to start planning.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Horizontal scroll so each day column keeps a comfortable width and the
          slot card details (faculty, subject, status) stay readable on narrow
          screens instead of getting truncated to a single letter. */}
      <div className="overflow-x-auto">
      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] divide-x divide-slate-200 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        {dates.map((date, i) => {
          const today = isToday(date);
          return (
            <div key={i} className={`py-3 text-center ${today ? 'bg-indigo-50 dark:bg-indigo-900' : ''}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${
                today ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {DAY_NAMES[i].slice(0, 3)}
              </p>
              <p className={`text-xl font-bold mt-0.5 ${
                today ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-100'
              }`}>
                {date.getDate()}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] divide-x divide-slate-200 dark:divide-slate-700 min-h-[420px]">
        {dates.map((date, i) => {
          const dayName = DAY_NAMES[i];
          const slots = slotsForWeekDay(timetable, dayName).map((s) => ({ ...s, _timetableId: timetable.id, _date: toDateStr(date) }));
          const today = isToday(date);
          return (
            <div key={i} className={`p-2 space-y-2 ${today ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}>
              {slots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  onEdit={onEditSlot}
                  onSetStatus={onSetStatus}
                  onDelete={onDeleteSlot}
                />
              ))}
              <button
                onClick={() => onAddSlot(dayName)}
                title="Add a slot on this day"
                className="w-full py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 rounded-md transition-colors border border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600">
                + Slot
              </button>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ── MonthlyView ───────────────────────────────────────────────────────────────

function MonthlyView({ currentDate, grid, timetableByWeek, onWeekClick }) {
  const month = currentDate.getMonth();

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {d.slice(0, 3)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((date, i) => {
          const inMonth = date.getMonth() === month;
          const today = isToday(date);
          const dayName = DAY_NAMES[i % 7];
          const weekStart = toDateStr(getWeekStart(date));
          const tt = timetableByWeek[weekStart];
          const slots = (tt?.slots || []).filter((s) => s.day_of_week === dayName);
          const isLastCol = (i + 1) % 7 === 0;
          const isLastRow = i >= 35;

          return (
            <button
              key={i}
              onClick={() => onWeekClick(date)}
              className={[
                'min-h-[88px] p-2 text-left transition-colors',
                !isLastCol && 'border-r border-slate-200 dark:border-slate-700',
                !isLastRow && 'border-b border-slate-200 dark:border-slate-700',
                today ? 'bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                       : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                !inMonth && 'opacity-35',
              ].filter(Boolean).join(' ')}
            >
              <div className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-sm font-semibold mb-1.5 ${
                today ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {date.getDate()}
              </div>

              <div className="flex flex-wrap gap-1">
                {slots.map((slot, si) => {
                  const status = slot.class_taken_status || 'scheduled';
                  return (
                    <span key={si}
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        status === 'not_taken'
                          ? 'bg-rose-400 dark:bg-rose-500'
                          : status === 'taken'
                            ? 'bg-green-500 dark:bg-green-400'
                            : 'bg-amber-400 dark:bg-amber-500'
                      }`}
                      title={`${slot.faculty_name || '—'} · ${slot.subject_name || '—'} (${status})`}
                    />
                  );
                })}
              </div>

              {slots[0] && (
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-1 leading-tight">
                  {slots[0].subject_name || slots[0].faculty_name || ''}
                  {slots.length > 1 && ` +${slots.length - 1}`}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-400" /> Taken
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 dark:bg-rose-500" /> Not taken
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 dark:bg-amber-500" /> Scheduled
        </div>
      </div>
    </div>
  );
}
