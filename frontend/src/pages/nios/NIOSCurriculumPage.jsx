import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';

const PARAM_ORDER = ['uni', 'batch', 'subject', 'chapter'];

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(2020 + i));

const RESOURCE_TYPES = ['notes', 'pdf', 'video', 'assignment', 'quiz', 'question_paper'];
const RESOURCE_LABELS = {
  notes: 'Notes', pdf: 'PDF', video: 'Video',
  assignment: 'Assignment', quiz: 'Quiz', question_paper: 'Question Paper',
};
const RESOURCE_CATEGORY = (type) =>
  type === 'assignment' ? 'Assignment' : 'Study Material';

export default function NIOSCurriculumPage() {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const uni     = params.get('uni');
  const batch   = params.get('batch');
  const subject = params.get('subject');
  const chapter = params.get('chapter');

  const uni_label     = params.get('uni_label') || '';
  const batch_label   = params.get('batch_label') || '';
  const subject_label = params.get('subject_label') || '';
  const chapter_label = params.get('chapter_label') || '';

  const level = chapter ? 4 : subject ? 3 : batch ? 2 : uni ? 1 : 0;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Subject assignment helpers
  const [allSubjects, setAllSubjects] = useState([]);
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [createSubjectForm, setCreateSubjectForm] = useState({ name: '', subject_code: '' });
  const [createSubjectSaving, setCreateSubjectSaving] = useState(false);

  function drillInto(param, id, label) {
    const newParams = new URLSearchParams(params);
    const idx = PARAM_ORDER.indexOf(param);
    PARAM_ORDER.slice(idx).forEach((p) => { newParams.delete(p); newParams.delete(`${p}_label`); });
    newParams.set(param, id);
    newParams.set(`${param}_label`, label);
    setParams(newParams);
  }

  function goToLevel(targetLevel) {
    const newParams = new URLSearchParams(params);
    PARAM_ORDER.slice(targetLevel).forEach((p) => { newParams.delete(p); newParams.delete(`${p}_label`); });
    setParams(newParams);
  }

  async function load() {
    setLoading(true);
    setItems([]);
    try {
      if (level === 0) {
        const res = await client.get('/nios/universities');
        setItems(res.data);
      } else if (level === 1) {
        const res = await client.get('/nios/batches', { params: { nios_university_id: uni, include_inactive: true } });
        setItems(res.data);
      } else if (level === 2) {
        const [bsRes, subRes] = await Promise.all([
          client.get('/nios/batch-subjects', { params: { nios_batch_id: batch } }),
          client.get('/nios/subjects'),
        ]);
        setItems(bsRes.data);
        const assignedIds = new Set(bsRes.data.map((bs) => bs.nios_subject_id));
        setAllSubjects(subRes.data.filter((s) => !assignedIds.has(s.id)));
      } else if (level === 3) {
        const res = await client.get('/nios/chapters', { params: { nios_batch_subject_id: subject, include_inactive: true } });
        setItems(res.data);
      } else if (level === 4) {
        const res = await client.get('/nios/resources', { params: { nios_chapter_id: chapter, include_inactive: true } });
        setItems(res.data);
      }
    } catch {
      toast.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [uni, batch, subject, chapter, level]);

  // ── Dialog helpers ────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm(editForm(item));
    setDialogOpen(true);
  }

  function defaultForm() {
    if (level === 1) return { name: '', year: '' };
    if (level === 2) return { nios_subject_id: '' };
    if (level === 3) return { title: '', description: '', chapter_order: 1 };
    if (level === 4) return { type: '', title: '', url: '', description: '' };
    return {};
  }

  function editForm(item) {
    if (level === 1) return { name: item.name, year: item.year || '' };
    if (level === 3) return { title: item.title, description: item.description || '', chapter_order: item.chapter_order };
    if (level === 4) return { type: item.type, title: item.title, url: item.url || '', description: item.description || '' };
    return {};
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (level === 1) {
        if (!form.name) { toast.error('Batch name is required.'); setSaving(false); return; }
        if (!form.year) { toast.error('Year is required.'); setSaving(false); return; }
        if (editing) {
          await client.put(`/nios/batches/${editing.id}`, form);
          toast.success('Batch updated.');
        } else {
          await client.post('/nios/batches', { ...form, nios_university_id: uni });
          toast.success('Batch created.');
        }
      } else if (level === 2) {
        await client.post('/nios/batch-subjects', { nios_batch_id: batch, nios_subject_id: form.nios_subject_id });
        toast.success('Subject assigned.');
      } else if (level === 3) {
        if (editing) {
          await client.put(`/nios/chapters/${editing.id}`, form);
          toast.success('Chapter updated.');
        } else {
          await client.post('/nios/chapters', { ...form, nios_batch_subject_id: subject });
          toast.success('Chapter created.');
        }
      } else if (level === 4) {
        if (editing) {
          await client.put(`/nios/resources/${editing.id}`, form);
          toast.success('Resource updated.');
        } else {
          await client.post('/nios/resources', { ...form, nios_chapter_id: chapter });
          toast.success('Resource created.');
        }
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item) {
    const label = item.name || item.title || item.subject_name || 'this item';
    const isRemove = level === 2;
    const ok = await confirm({
      title: isRemove ? 'Remove subject?' : 'Deactivate?',
      description: `Are you sure you want to ${isRemove ? 'remove' : 'deactivate'} "${label}"?`,
      confirmLabel: isRemove ? 'Remove' : 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      if (level === 2) {
        await client.delete(`/nios/batch-subjects/${item.id}`);
        toast.success('Subject removed from batch.');
      } else if (level === 3) {
        await client.delete(`/nios/chapters/${item.id}`);
        toast.success('Chapter deactivated.');
      } else if (level === 4) {
        await client.delete(`/nios/resources/${item.id}`);
        toast.success('Resource deactivated.');
      } else if (level === 1) {
        await client.delete(`/nios/batches/${item.id}`);
        toast.success('Batch deactivated.');
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    }
  }

  async function handleActivate(item) {
    try {
      if (level === 1) await client.patch(`/nios/batches/${item.id}/activate`);
      else if (level === 3) await client.patch(`/nios/chapters/${item.id}/activate`);
      else if (level === 4) await client.patch(`/nios/resources/${item.id}/activate`);
      toast.success('Activated.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    }
  }

  async function handleCreateSubject() {
    if (!createSubjectForm.name) { toast.error('Name is required.'); return; }
    setCreateSubjectSaving(true);
    try {
      const res = await client.post('/nios/subjects', createSubjectForm);
      await client.post('/nios/batch-subjects', { nios_batch_id: batch, nios_subject_id: res.data.id });
      toast.success('Subject created and assigned.');
      setCreateSubjectOpen(false);
      setCreateSubjectForm({ name: '', subject_code: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    } finally {
      setCreateSubjectSaving(false);
    }
  }

  // ── Page titles / labels ──────────────────────────────────────────────────

  const pageTitles = ['NIOS Universities', 'Batches', 'Subjects', 'Chapters', 'Resources'];
  const addLabels  = [null, '+ Add Batch', '+ Assign Subject', '+ Add Chapter', '+ Add Resource'];
  const canAdd = level >= 1;

  // ── Breadcrumb ────────────────────────────────────────────────────────────

  const crumbs = [
    { label: 'NIOS', onClick: () => goToLevel(0) },
    uni     && { label: uni_label,     onClick: () => goToLevel(1) },
    batch   && { label: batch_label,   onClick: () => goToLevel(2) },
    subject && { label: subject_label, onClick: () => goToLevel(3) },
    chapter && { label: chapter_label, onClick: () => goToLevel(4) },
  ].filter(Boolean);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {pageTitles[level]}
          </h1>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-400">/</span>}
                <button
                  onClick={c.onClick}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {c.label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {level === 2 && isAdmin() && (
            <Button variant="outline" size="sm" onClick={() => { setCreateSubjectOpen(true); setCreateSubjectForm({ name: '', subject_code: '' }); }}>
              + New Subject
            </Button>
          )}
          {canAdd && addLabels[level] && (
            <Button size="sm" onClick={openAdd}>{addLabels[level]}</Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing here yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 group ${level < 4 ? 'cursor-pointer hover:border-indigo-400' : ''}`}
              onClick={level < 4 ? () => {
                const label =
                  level === 0 ? item.name :
                  level === 1 ? item.name :
                  level === 2 ? item.subject_name :
                  level === 3 ? item.title : '';
                const id =
                  level === 0 ? item.id :
                  level === 1 ? item.id :
                  level === 2 ? item.id :      // nios_batch_subject id
                  level === 3 ? item.id : item.id;
                const paramKey = PARAM_ORDER[level];
                drillInto(paramKey, id, label);
              } : undefined}
            >
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.is_active === false || item.subject_active === false ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {level === 2 ? item.subject_name :
                   level === 3 ? item.title :
                   level === 4 ? item.title :
                   item.name}
                </p>
                {level === 1 && item.year && (
                  <p className="text-xs text-slate-500 mt-0.5">{item.year}</p>
                )}
                {level === 2 && item.subject_code && (
                  <p className="text-xs text-slate-500 mt-0.5">{item.subject_code}</p>
                )}
                {level === 3 && item.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-lg">{item.description}</p>
                )}
                {level === 4 && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {RESOURCE_LABELS[item.type] || item.type}
                    </Badge>
                    <span className="text-xs text-slate-400">{RESOURCE_CATEGORY(item.type)}</span>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:underline">
                        Open link
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {level > 0 && level !== 2 && (level !== 1 || isAdmin()) && (
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                )}
                {level >= 1 && (level > 2 || isAdmin()) && (
                  item.is_active === false || item.subject_active === false ? (
                    <button
                      onClick={() => handleActivate(item)}
                      className="text-xs text-green-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Activate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeactivate(item)}
                      className="text-xs text-red-500 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {level === 2 ? 'Remove' : 'Deactivate'}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit' : 'Add'}{' '}
              {level === 1 ? 'Batch' : level === 2 ? 'Subject' : level === 3 ? 'Chapter' : 'Resource'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Level 1: Batch */}
            {level === 1 && (
              <>
                <div className="space-y-1">
                  <Label>Batch Name *</Label>
                  <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Science Group" />
                </div>
                <div className="space-y-1">
                  <Label>Year *</Label>
                  <Select value={form.year || ''} onValueChange={(v) => setForm({ ...form, year: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select year…" /></SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Level 2: Assign existing subject */}
            {level === 2 && !editing && (
              <div className="space-y-1">
                <Label>Select Subject *</Label>
                <Select value={form.nios_subject_id || ''} onValueChange={(v) => setForm({ ...form, nios_subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose subject…" /></SelectTrigger>
                  <SelectContent>
                    {allSubjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}{s.subject_code ? ` (${s.subject_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Level 3: Chapter */}
            {level === 3 && (
              <>
                <div className="space-y-1">
                  <Label>Title *</Label>
                  <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                </div>
                <div className="space-y-1">
                  <Label>Order</Label>
                  <Input type="number" value={form.chapter_order || 1} onChange={(e) => setForm({ ...form, chapter_order: Number(e.target.value) })} />
                </div>
              </>
            )}

            {/* Level 4: Resource */}
            {level === 4 && (
              <>
                <div className="space-y-1">
                  <Label>Type *</Label>
                  <Select value={form.type || ''} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{RESOURCE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Title *</Label>
                  <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>URL / Link</Label>
                  <Input value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Subject Dialog */}
      <Dialog open={createSubjectOpen} onOpenChange={setCreateSubjectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New NIOS Subject</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Subject Name *</Label>
              <Input value={createSubjectForm.name} onChange={(e) => setCreateSubjectForm({ ...createSubjectForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Subject Code</Label>
              <Input value={createSubjectForm.subject_code} onChange={(e) => setCreateSubjectForm({ ...createSubjectForm, subject_code: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSubjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubject} disabled={createSubjectSaving}>
              {createSubjectSaving ? 'Creating…' : 'Create & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
