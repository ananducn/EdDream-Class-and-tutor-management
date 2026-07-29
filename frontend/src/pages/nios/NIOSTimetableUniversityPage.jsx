import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import client from '@/api/client';
import { SkeletonCards } from '@/components/Skeletons';

export default function NIOSTimetableUniversityPage() {
  const { uniId } = useParams();
  const navigate = useNavigate();

  const [universityName, setUniversityName] = useState('');
  const [streams, setStreams] = useState([]);
  const [batches, setBatches] = useState([]);
  const [timetableCountByBatch, setTimetableCountByBatch] = useState({});
  const [loading, setLoading] = useState(true);

  // Batch creation lives here now — a NIOS batch is a cohort of one stream, and
  // inherits that stream's syllabus.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', year: '', nios_stream_id: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uRes, sRes, bRes, tRes] = await Promise.all([
        client.get('/nios/universities'),
        client.get('/nios/streams', { params: { nios_university_id: uniId } }),
        client.get('/nios/batches', { params: { nios_university_id: uniId } }),
        client.get('/nios/timetables', { params: { nios_university_id: uniId } }),
      ]);
      const uni = uRes.data.find((u) => String(u.id) === uniId);
      setUniversityName(uni?.name || '');
      setStreams(sRes.data);
      setBatches(bRes.data);
      const tc = {};
      tRes.data.forEach((t) => {
        if (t.nios_batch_id) tc[t.nios_batch_id] = (tc[t.nios_batch_id] || 0) + 1;
      });
      setTimetableCountByBatch(tc);
    } catch {
      toast.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [uniId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateBatch() {
    if (!form.name) { toast.error('Batch name is required.'); return; }
    if (!form.nios_stream_id) { toast.error('Stream is required.'); return; }
    setSaving(true);
    try {
      await client.post('/nios/batches', { nios_stream_id: form.nios_stream_id, name: form.name, year: form.year || null });
      toast.success('Batch created.');
      setDialogOpen(false);
      setForm({ name: '', year: '', nios_stream_id: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create batch.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate('/nios/timetable')}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          NIOS Timetable
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {loading ? '...' : universityName}
        </span>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Batches</h2>
            <Button size="sm" disabled={streams.length === 0} onClick={() => { setForm({ name: '', year: '', nios_stream_id: '' }); setDialogOpen(true); }}>+ Add Batch</Button>
          </div>
          {streams.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No streams yet. Add a stream under this university in NIOS Curriculum first — a batch belongs to a stream.
            </p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No batches yet. Add a batch to start scheduling its timetable.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {batches.map((batch) => {
                const tc = timetableCountByBatch[batch.id] || 0;
                return (
                  <button
                    key={batch.id}
                    onClick={() => navigate(`/nios/timetable/${uniId}/${batch.id}`)}
                    className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                          {batch.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {[batch.stream_name, batch.year].filter(Boolean).join(' · ')}
                        </p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            tc > 0
                              ? 'bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                              : 'bg-amber-50 dark:bg-amber-900 text-amber-600 dark:text-amber-300'
                          }`}>
                            {tc > 0 ? `${tc} timetable${tc > 1 ? 's' : ''}` : 'No timetable yet'}
                          </span>
                        </div>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 dark:group-hover:text-indigo-500 text-xl leading-none transition-colors shrink-0 mt-0.5">
                        ›
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Batch</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Stream *</Label>
              <Select value={form.nios_stream_id} onValueChange={(v) => setForm({ ...form, nios_stream_id: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a stream" /></SelectTrigger>
                <SelectContent>
                  {streams.map((st) => <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">The batch inherits this stream's subjects.</p>
            </div>
            <div className="space-y-1">
              <Label>Batch Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Science Group" />
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2026" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBatch} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
