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
import client from '@/api/client';
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

function getDayName(date) {
  const d = date.getDay();
  return DAY_NAMES[d === 0 ? 6 : d - 1];
}

function isToday(date) {
  return toDateStr(date) === toDateStr(new Date());
}

const emptySlotForm = { day_of_week: '', start_time: '', end_time: '', faculty_id: '', subject_id: '', notes: '' };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TimetableCalendarPage() {
  const { universityId, batchId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // Reference data
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Timetable details for this batch, keyed by week_start_date ('YYYY-MM-DD')
  const [timetableByWeek, setTimetableByWeek] = useState({});

  // Breadcrumb names
  const [universityName, setUniversityName] = useState('');
  const [batchName, setBatchName] = useState('');

  // Calendar navigation
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Add slot dialog
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [savingSlot, setSavingSlot] = useState(false);

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
      const [fRes, sRes] = await Promise.all([
        client.get('/faculty'),
        client.get('/subjects', { params: { university_id: universityId } }),
      ]);
      setFaculty(fRes.data);
      setSubjects(sRes.data);
    } catch {
      toast.error('Failed to load reference data.');
    }
  }

  const loadTimetables = useCallback(async () => {
    try {
      const res = await client.get('/timetables');
      const batchTTs = res.data.filter(
        (t) => String(t.batch_id) === batchId && String(t.university_id) === universityId
      );

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
    const label = `Week of ${weekStartStr}${batchName ? ` – ${batchName}` : ''}`;
    const res = await client.post('/timetables', {
      name: label,
      university_id: universityId,
      batch_id: batchId,
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
    try {
      await client.delete(`/timetables/${currentTimetable.id}`);
      toast.success('Timetable deleted.');
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
    setSlotOpen(true);
  }

  async function handleAddSlot(e) {
    e.preventDefault();
    setSavingSlot(true);
    try {
      const tt = await ensureWeekTimetable();
      await client.post(`/timetables/${tt.id}/slots`, slotForm);
      toast.success('Slot added.');
      setSlotOpen(false);
      setSlotForm(emptySlotForm);
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleDeleteSlot(slot) {
    try {
      await client.delete(`/timetables/${slot._timetableId}/slots/${slot.id}`);
      toast.success('Slot removed.');
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
    setEditSlotOpen(true);
  }

  async function handleEditSlot(e) {
    e.preventDefault();
    if (!editSlotTarget) return;
    setSavingEditSlot(true);
    try {
      await client.put(
        `/timetables/${editSlotTarget.timetableId}/slots/${editSlotTarget.slot.id}`,
        editSlotForm
      );
      toast.success('Slot updated.');
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
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {batchName || '...'}
        </span>
      </div>

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
              <Select value={slotForm.subject_id}
                onValueChange={(v) => setSlotForm({ ...slotForm, subject_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={slotForm.notes}
                onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} />
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

      {/* ── Edit Slot dialog ── */}
      <Dialog open={editSlotOpen} onOpenChange={setEditSlotOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Slot</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSlot} className="space-y-4 pt-1">
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
              <Select value={editSlotForm.subject_id}
                onValueChange={(v) => setEditSlotForm({ ...editSlotForm, subject_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={editSlotForm.notes}
                onChange={(e) => setEditSlotForm({ ...editSlotForm, notes: e.target.value })} />
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
  const status = slot.class_taken_status || 'scheduled';
  const border = status === 'taken'
    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
    : status === 'not_taken'
      ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate leading-tight">
            {slot.faculty_name || '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{slot.subject_name || '—'}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={status} />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors text-base leading-none"
              title="Actions"
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status !== 'taken' && (
                <DropdownMenuItem onClick={() => onSetStatus(slot, 'taken')}>
                  Mark taken
                </DropdownMenuItem>
              )}
              {status !== 'not_taken' && (
                <DropdownMenuItem
                  onClick={() => onSetStatus(slot, 'not_taken')}
                  className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
                >
                  Mark not taken
                </DropdownMenuItem>
              )}
              {status !== 'scheduled' && (
                <DropdownMenuItem onClick={() => onSetStatus(slot, 'scheduled')}>
                  Reset to scheduled
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(slot)}>
                Edit slot
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(slot)}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                Remove slot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(slot.start_time || slot.end_time) && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
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
      <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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

      <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-700 min-h-[420px]">
        {dates.map((date, i) => {
          const dayName = DAY_NAMES[i];
          const slots = slotsForWeekDay(timetable, dayName).map((s) => ({ ...s, _timetableId: timetable.id }));
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
