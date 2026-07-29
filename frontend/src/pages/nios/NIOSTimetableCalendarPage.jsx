import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';
import { to12h } from '@/lib/time';
import { takenLockReason } from '@/lib/editWindow';
import LockedBadge from '@/components/LockedBadge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
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

const emptySlotForm = { day_of_week: '', start_time: '', end_time: '', faculty_id: '', nios_chapter_ids: [], notes: '' };

// Derive subject / chapter labels from a slot's chapters array (falls back to
// the legacy singular subject for pre-migration slots).
function slotSubjects(slot) {
  const chs = Array.isArray(slot?.chapters) ? slot.chapters : [];
  if (!chs.length) return slot?.subject_name || '';
  return [...new Set(chs.map((x) => x.subject_name).filter(Boolean))].join(', ');
}
function slotChapters(slot) {
  const chs = Array.isArray(slot?.chapters) ? slot.chapters : [];
  return chs.map((x) => x.chapter_title).filter(Boolean).join(', ');
}

function toggleId(arr, id) {
  const s = String(id);
  return arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s];
}

// Reusable multi-chapter picker grouped by subject. `chaptersBySubject` and
// `ensureChapters` are lifted to the page so both the add and edit dialogs share
// one cache.
function ChapterPicker({ subjects, chaptersBySubject, ensureChapters, selectedIds, onToggle }) {
  const [pickerSubject, setPickerSubject] = useState('');

  function chapterLabel(id) {
    for (const [subjectId, chs] of Object.entries(chaptersBySubject)) {
      const ch = chs.find((c) => String(c.id) === String(id));
      if (ch) {
        const subj = subjects.find((s) => String(s.nios_subject_id) === String(subjectId));
        return { title: ch.title, subject_name: subj?.subject_name || '' };
      }
    }
    return { title: `#${id}`, subject_name: '' };
  }

  async function handleSubject(subjectId) {
    setPickerSubject(subjectId);
    await ensureChapters(subjectId);
  }

  return (
    <div className="space-y-2">
      <Label>Chapters <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(one or more, across subjects)</span></Label>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const { title, subject_name } = chapterLabel(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200">
                {subject_name ? `${subject_name}: ` : ''}{title}
                <button type="button" onClick={() => onToggle(id)} className="text-slate-400 hover:text-red-500" aria-label="Remove">×</button>
              </span>
            );
          })}
        </div>
      )}

      <Select value={pickerSubject} onValueChange={handleSubject}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Select a subject to add its chapters" /></SelectTrigger>
        <SelectContent>
          {subjects.map((s) => <SelectItem key={s.nios_subject_id} value={String(s.nios_subject_id)}>{s.subject_name}</SelectItem>)}
        </SelectContent>
      </Select>

      {pickerSubject && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {(chaptersBySubject[pickerSubject] || []).length === 0 && (
            <p className="p-2 text-xs text-slate-500 dark:text-slate-400">No chapters for this subject.</p>
          )}
          {(chaptersBySubject[pickerSubject] || []).map((ch) => {
            const selected = selectedIds.includes(String(ch.id));
            return (
              <button type="button" key={ch.id} onClick={() => onToggle(ch.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${selected ? 'bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{selected ? '✓' : ''}</span>
                {ch.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Batches this slot can also be added to. A slot's chapters can span several
// subjects, so a batch only qualifies if its stream carries EVERY one of them —
// otherwise a Commerce-only subject could land on a Science batch's grid.
function CommonBatchPicker({ subjectIds, batches, streamSubjects, currentBatchId, selected, onToggle }) {
  if (subjectIds.length === 0) {
    return <p className="text-xs text-slate-400">Pick a chapter first — the batches on offer depend on which subjects it covers.</p>;
  }
  const subjectsByStream = new Map();
  for (const ss of streamSubjects) {
    const k = String(ss.nios_stream_id);
    if (!subjectsByStream.has(k)) subjectsByStream.set(k, new Set());
    subjectsByStream.get(k).add(String(ss.nios_subject_id));
  }
  const eligible = batches.filter((b) => {
    if (String(b.id) === String(currentBatchId)) return false;
    const carried = subjectsByStream.get(String(b.nios_stream_id));
    return carried && subjectIds.every((sid) => carried.has(String(sid)));
  });
  if (eligible.length === 0) {
    return <p className="text-xs text-slate-400">No other batch shares every subject in this slot.</p>;
  }
  const streamNames = [...new Set(eligible.map((b) => b.stream_name || 'No stream'))].sort();
  return (
    <div className="space-y-3 rounded-md border border-slate-200 dark:border-slate-700 p-3 max-h-48 overflow-y-auto">
      {streamNames.map((name) => (
        <div key={name} className="space-y-1">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{name}</p>
          {eligible.filter((b) => (b.stream_name || 'No stream') === name).map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer pl-1 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.includes(String(b.id))}
                onChange={() => onToggle(b.id)}
              />
              {b.name}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NIOSTimetableCalendarPage() {
  const { uniId, batchId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();

  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chaptersBySubject, setChaptersBySubject] = useState({}); // { [subjectId]: [{id, title}] }
  const [timetableByWeek, setTimetableByWeek] = useState({});
  const [universityName, setUniversityName] = useState('');
  const [batchName, setBatchName] = useState('');

  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [slotOpen, setSlotOpen] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [savingSlot, setSavingSlot] = useState(false);

  const [editSlotOpen, setEditSlotOpen] = useState(false);
  const [editSlotTarget, setEditSlotTarget] = useState(null);
  const [editSlotForm, setEditSlotForm] = useState(emptySlotForm);
  const [savingEditSlot, setSavingEditSlot] = useState(false);

  // Common class: the same slot in several batches' grids for this week.
  const [allBatches, setAllBatches] = useState([]);
  const [streamSubjects, setStreamSubjects] = useState([]);
  const [commonSlot, setCommonSlot] = useState(false);
  const [sharedBatchIds, setSharedBatchIds] = useState([]);
  const [editCommonSlot, setEditCommonSlot] = useState(false);
  const [editSharedBatchIds, setEditSharedBatchIds] = useState([]);

  const [busy, setBusy] = useState(false);

  const weekStartStr = toDateStr(getWeekStart(currentDate));
  const currentTimetable = timetableByWeek[weekStartStr] || null;

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadDropdowns() {
    try {
      const [fRes, uRes, bRes] = await Promise.all([
        client.get('/faculty'),
        client.get('/nios/universities'),
        client.get('/nios/batches', { params: { nios_university_id: uniId } }),
      ]);
      setFaculty(fRes.data);
      setUniversityName(uRes.data.find((u) => String(u.id) === uniId)?.name || '');
      setAllBatches(bRes.data);
      const batch = bRes.data.find((b) => String(b.id) === batchId);
      setBatchName(batch?.name || '');
      // Every placement in the university, so the common-class picker can tell
      // which other batches carry the subjects this slot covers.
      const allSs = await client.get('/nios/stream-subjects', { params: { nios_university_id: uniId } });
      setStreamSubjects(allSs.data);
      // The syllabus belongs to the batch's stream, so only that stream's
      // subjects can be scheduled for this batch.
      setSubjects(batch?.nios_stream_id
        ? allSs.data.filter((ss) => String(ss.nios_stream_id) === String(batch.nios_stream_id))
        : []);
    } catch {
      toast.error('Failed to load reference data.');
    }
  }

  const loadTimetables = useCallback(async () => {
    try {
      const res = await client.get('/nios/timetables', { params: { nios_batch_id: batchId } });
      const batchTTs = res.data.filter((t) => String(t.nios_batch_id) === batchId);

      const details = await Promise.all(batchTTs.map((t) => client.get(`/nios/timetables/${t.id}`)));
      const map = {};
      details.forEach((r) => {
        const wk = normWeekStart(r.data.week_start_date);
        if (!wk) return;
        if (!map[wk]) map[wk] = r.data;
      });
      setTimetableByWeek(map);
    } catch {
      toast.error('Failed to load timetables.');
    }
  }, [batchId]);

  useEffect(() => {
    loadDropdowns();
    loadTimetables();
  }, [uniId, batchId, loadTimetables]);

  // ── Calendar navigation ───────────────────────────────────────────────────

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

  // ── Create timetable on demand ────────────────────────────────────────────

  async function ensureWeekTimetable() {
    if (currentTimetable) return currentTimetable;
    const label = `Week of ${weekStartStr}${batchName ? ` – ${batchName}` : ''}`;
    const res = await client.post('/nios/timetables', {
      name: label,
      nios_university_id: uniId,
      nios_batch_id: batchId,
      week_start_date: weekStartStr,
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
      description: 'Are you sure you want to delete this week\'s timetable? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/nios/timetables/${currentTimetable.id}`);
      toast.success('Timetable deleted.');
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete.');
    }
  }

  // ── Slot status ───────────────────────────────────────────────────────────

  async function setSlotStatus(slot, status) {
    try {
      await client.put(`/nios/timetables/${slot._timetableId}/slots/${slot.id}`, { class_taken_status: status });
      toast.success(
        status === 'taken' ? 'Marked taken — class added to NIOS Classes.'
          : status === 'not_taken' ? 'Marked not taken.' : 'Marked scheduled.'
      );
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status.');
    }
  }

  // Load (once) and cache the chapters for a given subject in this university
  async function ensureChapters(subjectId) {
    if (!subjectId || chaptersBySubject[subjectId]) return;
    const us = subjects.find((s) => String(s.nios_subject_id) === String(subjectId));
    if (!us) return;
    try {
      const res = await client.get('/nios/chapters', { params: { nios_stream_subject_id: us.id } });
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: res.data }));
    } catch { /**/ }
  }

  // ── Add slot ──────────────────────────────────────────────────────────────

  // Which subjects a set of chapter ids belongs to — drives the common-class
  // batch picker, since a batch must carry all of them to qualify.
  const subjectIdsForChapters = useCallback((chapterIds) => {
    const ids = new Set();
    for (const [subjectId, chapters] of Object.entries(chaptersBySubject)) {
      if (chapters.some((ch) => chapterIds.includes(String(ch.id)))) ids.add(subjectId);
    }
    return [...ids];
  }, [chaptersBySubject]);

  function openAddSlot(prefillDay) {
    setSlotForm({ ...emptySlotForm, day_of_week: prefillDay || '' });
    setCommonSlot(false);
    setSharedBatchIds([]);
    setSlotOpen(true);
  }

  async function handleAddSlot(e) {
    e.preventDefault();
    setSavingSlot(true);
    try {
      const tt = await ensureWeekTimetable();
      const payload = commonSlot && sharedBatchIds.length > 0
        ? { ...slotForm, nios_batch_ids: sharedBatchIds.map(Number) }
        : slotForm;
      const res = await client.post(`/nios/timetables/${tt.id}/slots`, payload);
      const n = res.data?.shared_count || 1;
      toast.success(n > 1 ? `Slot added to ${n} batches.` : 'Slot added.');
      setSlotOpen(false);
      setSlotForm(emptySlotForm);
      setCommonSlot(false);
      setSharedBatchIds([]);
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleDeleteSlot(slot) {
    const shared = slot.shared_batches || [];
    const ok = await confirm({
      title: 'Remove slot?',
      description: shared.length
        ? `This is a common class. Removing it also removes it from ${shared.join(', ')}, along with any linked classes.`
        : 'Are you sure you want to remove this slot from the timetable?',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/nios/timetables/${slot._timetableId}/slots/${slot.id}`);
      toast.success('Slot removed.');
      await loadTimetables();
    } catch {
      toast.error('Failed to remove slot.');
    }
  }

  // ── Edit slot ─────────────────────────────────────────────────────────────

  async function openEditSlot(slot) {
    setEditSlotTarget({ slot, timetableId: slot._timetableId });
    setEditCommonSlot((slot.shared_batch_ids || []).length > 0);
    setEditSharedBatchIds((slot.shared_batch_ids || []).map(String));
    setEditSlotForm({
      day_of_week: slot.day_of_week || '',
      start_time: slot.start_time?.slice(0, 5) || '',
      end_time: slot.end_time?.slice(0, 5) || '',
      faculty_id: slot.faculty_id ? String(slot.faculty_id) : '',
      nios_chapter_ids: (slot.chapters || []).map((ch) => String(ch.nios_chapter_id)),
      notes: slot.notes || '',
    });
    // Preload chapters for the subjects this slot already covers so chips resolve
    const subjectIds = [...new Set((slot.chapters || []).map((ch) => ch.nios_subject_id).filter(Boolean))];
    await Promise.all(subjectIds.map((sid) => ensureChapters(sid)));
    setEditSlotOpen(true);
  }

  async function handleEditSlot(e) {
    e.preventDefault();
    if (!editSlotTarget) return;
    setSavingEditSlot(true);
    try {
      // Sending nios_batch_ids re-reconciles who the slot is shared with; the
      // toggle off means "no other batches", which is an empty array, not absent.
      const res = await client.put(
        `/nios/timetables/${editSlotTarget.timetableId}/slots/${editSlotTarget.slot.id}`,
        { ...editSlotForm, nios_batch_ids: editCommonSlot ? editSharedBatchIds.map(Number) : [] }
      );
      const n = res.data?.shared_count || 1;
      toast.success(n > 1 ? `Slot updated across ${n} batches.` : 'Slot updated.');
      setEditSlotOpen(false);
      setEditSlotTarget(null);
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update slot.');
    } finally {
      setSavingEditSlot(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const weekDates = getWeekDates(currentDate);
  const monthGrid = getMonthGrid(currentDate);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate('/nios/timetable')}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          NIOS Timetable
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <button
          onClick={() => navigate(`/nios/timetable/${uniId}`)}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          {universityName || '...'}
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{batchName || '...'}</span>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-2">
        {currentTimetable ? (
          <>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{currentTimetable.name}</span>
            <Button size="sm" variant="outline" onClick={() => openAddSlot('')}>Add Slot</Button>
            {isAdmin() && (
              <Button size="sm" variant="ghost"
                className="text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900"
                onClick={handleDeleteTimetable}>
                Delete This Week
              </Button>
            )}
          </>
        ) : view === 'week' ? (
          <Button size="sm" onClick={handleCreateWeek} disabled={busy}>+ Create timetable for this week</Button>
        ) : null}

        <div className="flex-1" />

        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
          {['week', 'month'].map((v) => (
            <button key={v}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                view === v ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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

      {/* Weekly view */}
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

      {/* Monthly view */}
      {view === 'month' && (
        <MonthlyView
          currentDate={currentDate}
          grid={monthGrid}
          timetableByWeek={timetableByWeek}
          onWeekClick={(date) => { setCurrentDate(date); setView('week'); }}
        />
      )}

      {/* Add Slot dialog */}
      <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Slot</DialogTitle></DialogHeader>
          <form onSubmit={handleAddSlot} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Day *</Label>
              <Select value={slotForm.day_of_week} onValueChange={(v) => setSlotForm({ ...slotForm, day_of_week: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>{DAY_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Faculty</Label>
              <Select value={slotForm.faculty_id} onValueChange={(v) => setSlotForm({ ...slotForm, faculty_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ChapterPicker
              subjects={subjects}
              chaptersBySubject={chaptersBySubject}
              ensureChapters={ensureChapters}
              selectedIds={slotForm.nios_chapter_ids}
              onToggle={(id) => setSlotForm((f) => ({ ...f, nios_chapter_ids: toggleId(f.nios_chapter_ids, id) }))}
            />
            {/* Common class — the same slot in several batches' grids for this week. */}
            <div className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 p-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={commonSlot}
                  onChange={(e) => { setCommonSlot(e.target.checked); if (!e.target.checked) setSharedBatchIds([]); }}
                />
                Common class — also add to other batches
              </label>
              {commonSlot && (
                <CommonBatchPicker
                  subjectIds={subjectIdsForChapters(slotForm.nios_chapter_ids)}
                  batches={allBatches}
                  streamSubjects={streamSubjects}
                  currentBatchId={batchId}
                  selected={sharedBatchIds}
                  onToggle={(id) => setSharedBatchIds((prev) => toggleId(prev, id))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={slotForm.notes} onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSlotOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingSlot || !slotForm.day_of_week}>
                {savingSlot ? 'Adding…' : 'Add Slot'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Slot dialog */}
      <Dialog open={editSlotOpen} onOpenChange={setEditSlotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Slot</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSlot} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Day *</Label>
              <Select value={editSlotForm.day_of_week} onValueChange={(v) => setEditSlotForm({ ...editSlotForm, day_of_week: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>{DAY_NAMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={editSlotForm.start_time} onChange={(e) => setEditSlotForm({ ...editSlotForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={editSlotForm.end_time} onChange={(e) => setEditSlotForm({ ...editSlotForm, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Faculty</Label>
              <Select value={editSlotForm.faculty_id} onValueChange={(v) => setEditSlotForm({ ...editSlotForm, faculty_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{faculty.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ChapterPicker
              subjects={subjects}
              chaptersBySubject={chaptersBySubject}
              ensureChapters={ensureChapters}
              selectedIds={editSlotForm.nios_chapter_ids}
              onToggle={(id) => setEditSlotForm((f) => ({ ...f, nios_chapter_ids: toggleId(f.nios_chapter_ids, id) }))}
            />
            <div className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 p-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editCommonSlot}
                  onChange={(e) => { setEditCommonSlot(e.target.checked); if (!e.target.checked) setEditSharedBatchIds([]); }}
                />
                Common class — shared with other batches
              </label>
              {editSlotTarget?.slot?.shared_batches?.length > 0 && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  ⧉ These changes also apply to {editSlotTarget.slot.shared_batches.join(', ')}.
                </p>
              )}
              {editCommonSlot && (
                <CommonBatchPicker
                  subjectIds={subjectIdsForChapters(editSlotForm.nios_chapter_ids)}
                  batches={allBatches}
                  streamSubjects={streamSubjects}
                  currentBatchId={batchId}
                  selected={editSharedBatchIds}
                  onToggle={(id) => setEditSharedBatchIds((prev) => toggleId(prev, id))}
                />
              )}
              {editCommonSlot && editSharedBatchIds.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No batches ticked — saving will leave this slot in this batch only.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={editSlotForm.notes} onChange={(e) => setEditSlotForm({ ...editSlotForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditSlotOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingEditSlot}>
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusBadge status={status} />
          <LockedBadge reason={lock} />
        </div>
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors text-base leading-none" title="Actions">
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status !== 'taken' && <DropdownMenuItem disabled={!!lock} onClick={() => onSetStatus(slot, 'taken')}>Mark taken</DropdownMenuItem>}
              {status !== 'not_taken' && (
                <DropdownMenuItem disabled={!!lock} onClick={() => onSetStatus(slot, 'not_taken')} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
                  Mark not taken
                </DropdownMenuItem>
              )}
              {status !== 'scheduled' && <DropdownMenuItem disabled={!!lock} onClick={() => onSetStatus(slot, 'scheduled')}>Reset to scheduled</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!!lock} onClick={() => onEdit(slot)}>Edit slot</DropdownMenuItem>
              <DropdownMenuItem disabled={!!lock} onClick={() => onDelete(slot)} className="text-red-600 focus:text-red-600 dark:text-red-400">Remove slot</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-tight break-words">{slot.faculty_name || '—'}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{slotSubjects(slot) || '—'}</p>
        {slotChapters(slot) && <p className="text-[11px] text-slate-400 dark:text-slate-500 break-words">{slotChapters(slot)}</p>}
      </div>
      {(slot.start_time || slot.end_time) && (
        <p className="text-xs text-slate-400 dark:text-slate-500">{to12h(slot.start_time?.slice(0, 5))} – {to12h(slot.end_time?.slice(0, 5))}</p>
      )}
      {slot.notes && <p className="text-xs text-slate-400 dark:text-slate-500 italic">{slot.notes}</p>}
    </div>
  );
}

// ── WeeklyView ────────────────────────────────────────────────────────────────

function WeeklyView({ dates, timetable, slotsForWeekDay, onAddSlot, onEditSlot, onSetStatus, onDeleteSlot }) {
  if (!timetable) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No timetable for this week. Use "Create timetable for this week" above to start planning.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] divide-x divide-slate-200 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          {dates.map((date, i) => {
            const today = isToday(date);
            return (
              <div key={i} className={`py-3 text-center ${today ? 'bg-indigo-50 dark:bg-indigo-900' : ''}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${today ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {DAY_NAMES[i].slice(0, 3)}
                </p>
                <p className={`text-xl font-bold mt-0.5 ${today ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-100'}`}>
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
                  <SlotCard key={slot.id} slot={slot} onEdit={onEditSlot} onSetStatus={onSetStatus} onDelete={onDeleteSlot} />
                ))}
                <button
                  onClick={() => onAddSlot(dayName)}
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
            <button key={i} onClick={() => onWeekClick(date)}
              className={[
                'min-h-[88px] p-2 text-left transition-colors',
                !isLastCol && 'border-r border-slate-200 dark:border-slate-700',
                !isLastRow && 'border-b border-slate-200 dark:border-slate-700',
                today ? 'bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                !inMonth && 'opacity-35',
              ].filter(Boolean).join(' ')}
            >
              <div className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-sm font-semibold mb-1.5 ${today ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-wrap gap-1">
                {slots.map((slot, si) => {
                  const status = slot.class_taken_status || 'scheduled';
                  return (
                    <span key={si} className={`w-2 h-2 rounded-full shrink-0 ${
                      status === 'not_taken' ? 'bg-rose-400 dark:bg-rose-500'
                        : status === 'taken' ? 'bg-green-500 dark:bg-green-400'
                        : 'bg-amber-400 dark:bg-amber-500'
                    }`} title={`${slot.faculty_name || '—'} · ${slotSubjects(slot) || '—'} (${status})`} />
                  );
                })}
              </div>
              {slots[0] && (
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-1 leading-tight">
                  {slotSubjects(slots[0]) || slots[0].faculty_name || ''}
                  {slots.length > 1 && ` +${slots.length - 1}`}
                </p>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-400" /> Taken</div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 dark:bg-rose-500" /> Not taken</div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 dark:bg-amber-500" /> Scheduled</div>
      </div>
    </div>
  );
}
