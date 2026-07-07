import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirm } from '@/context/ConfirmContext';
import client from '@/api/client';

const RESOURCE_TYPES = [
  { value: 'notes',           label: 'Notes' },
  { value: 'pdf',             label: 'PDF' },
  { value: 'video',           label: 'Video' },
  { value: 'assignment',      label: 'Assignment' },
  { value: 'quiz',            label: 'Quiz' },
  { value: 'question_paper',  label: 'Question Paper' },
];

const TYPE_COLORS = {
  notes:          'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pdf:            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  video:          'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  assignment:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  quiz:           'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  question_paper: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
};

// semester sits between year and subject
const PARAM_ORDER = ['uni', 'stream', 'batch', 'year', 'semester', 'subject', 'chapter'];

export default function CurriculumPage() {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const uni      = searchParams.get('uni');
  const stream   = searchParams.get('stream');
  const batch    = searchParams.get('batch');
  const year     = searchParams.get('year');
  const semester = searchParams.get('semester');
  const subject  = searchParams.get('subject');
  const chapter  = searchParams.get('chapter');

  const uniLabel      = searchParams.get('uni_label');
  const streamLabel   = searchParams.get('stream_label');
  const batchLabel    = searchParams.get('batch_label');
  const yearLabel     = searchParams.get('year_label');
  const semesterLabel = searchParams.get('semester_label');
  const subjectLabel  = searchParams.get('subject_label');
  const chapterLabel  = searchParams.get('chapter_label');

  // 0=Unis 1=Streams 2=Batches 3=AcadYears 4=Sems|Subjects 5=Subjects(via sem) 6=Chapters 7=Resources
  const level = chapter ? 7 : subject ? 6 : semester ? 5 : year ? 4 : batch ? 3 : stream ? 2 : uni ? 1 : 0;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  // At level 4 (year selected), tracks whether this year uses semesters
  const [hasSemesters, setHasSemesters] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState([]);

  // "Create new subject" dialog — used at level 4/5 to create + auto-assign
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [createSubjectForm, setCreateSubjectForm] = useState({ name: '', subject_code: '' });
  const [createSubjectSaving, setCreateSubjectSaving] = useState(false);

  // Dedicated dialog for adding a semester to a specific year from the year list row
  const [semDialogOpen, setSemDialogOpen] = useState(false);
  const [semTargetYear, setSemTargetYear] = useState(null);
  const [semForm, setSemForm] = useState({ name: '', semester_order: '1' });
  const [semSaving, setSemSaving] = useState(false);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function drillInto(param, id, label) {
    const next = new URLSearchParams(searchParams);
    const idx = PARAM_ORDER.indexOf(param);
    for (let i = idx; i < PARAM_ORDER.length; i++) {
      next.delete(PARAM_ORDER[i]);
      next.delete(`${PARAM_ORDER[i]}_label`);
    }
    next.set(param, id);
    next.set(`${param}_label`, label);
    setSearchParams(next);
  }

  function goToLevel(targetLevel) {
    const next = new URLSearchParams(searchParams);
    for (let i = targetLevel; i < PARAM_ORDER.length; i++) {
      next.delete(PARAM_ORDER[i]);
      next.delete(`${PARAM_ORDER[i]}_label`);
    }
    setSearchParams(next);
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      if (level === 0) {
        const res = await client.get('/universities');
        setItems(res.data);
      } else if (level === 1) {
        const res = await client.get(`/streams?university_id=${uni}`);
        setItems(res.data);
      } else if (level === 2) {
        const res = await client.get(`/batches?university_id=${uni}&stream_id=${stream}`);
        setItems(res.data);
      } else if (level === 3) {
        const res = await client.get(`/academic-years?batch_id=${batch}&include_inactive=true`);
        setItems(res.data);
      } else if (level === 4) {
        // Check whether this year uses semesters or assigns subjects directly
        const semRes = await client.get(`/semesters?academic_year_id=${year}&include_inactive=true`);
        if (semRes.data.length > 0) {
          setHasSemesters(true);
          setItems(semRes.data);
        } else {
          setHasSemesters(false);
          const subRes = await client.get(`/academic-year-subjects?academic_year_id=${year}`);
          setItems(subRes.data);
        }
      } else if (level === 5) {
        const res = await client.get(`/academic-year-subjects?semester_id=${semester}`);
        setItems(res.data);
      } else if (level === 6) {
        const res = await client.get(`/chapters?academic_year_subject_id=${subject}&include_inactive=true`);
        setItems(res.data);
      } else if (level === 7) {
        const res = await client.get(`/learning-resources?chapter_id=${chapter}&include_inactive=true`);
        setItems(res.data);
      }
    } catch {
      toast.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setHasSemesters(false);
    load();
  }, [level, uni, stream, batch, year, semester, subject, chapter]);

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  async function openAdd() {
    setEditing(null);
    if (level === 0) {
      setForm({ name: '', short_code: '' });
    } else if (level === 1) {
      setForm({ name: '' });
    } else if (level === 2) {
      setForm({ name: '' });
    } else if (level === 3) {
      setForm({ name: '', year_order: String(items.length + 1) });
    } else if (level === 4 && hasSemesters) {
      setForm({ name: '', semester_order: String(items.length + 1) });
    } else if (level === 4 || level === 5) {
      setForm({ subject_id: '' });
      try {
        const res = await client.get(`/subjects?university_id=${uni}&stream_id=${stream}`);
        const already = new Set(items.map((i) => String(i.subject_id)));
        setAvailableSubjects(res.data.filter((s) => !already.has(String(s.id))));
      } catch { toast.error('Failed to load subjects.'); }
    } else if (level === 6) {
      setForm({ title: '', description: '', chapter_order: String(items.filter((i) => i.is_active).length + 1) });
    } else if (level === 7) {
      setForm({ type: '', title: '', url: '', description: '' });
    }
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    if (level === 3) setForm({ name: item.name, year_order: String(item.year_order) });
    else if (level === 4 && hasSemesters) setForm({ name: item.name, semester_order: String(item.semester_order) });
    else if (level === 6) setForm({ title: item.title, description: item.description || '', chapter_order: String(item.chapter_order) });
    else if (level === 7) setForm({ type: item.type, title: item.title, url: item.url || '', description: item.description || '' });
    setDialogOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (level === 0) {
        await client.post('/universities', { name: form.name, short_code: form.short_code || null });
        toast.success('University added.');
      } else if (level === 1) {
        await client.post('/streams', { name: form.name, university_id: uni });
        toast.success('Stream added.');
      } else if (level === 2) {
        await client.post('/batches', { name: form.name, university_id: uni, stream_id: stream });
        toast.success('Batch added.');
      } else if (level === 3) {
        const payload = { batch_id: batch, name: form.name, year_order: parseInt(form.year_order) || 1 };
        editing ? await client.put(`/academic-years/${editing.id}`, payload) : await client.post('/academic-years', payload);
        toast.success(editing ? 'Academic year updated.' : 'Academic year added.');
      } else if (level === 4 && hasSemesters) {
        const payload = { academic_year_id: year, name: form.name, semester_order: parseInt(form.semester_order) || 1 };
        editing ? await client.put(`/semesters/${editing.id}`, payload) : await client.post('/semesters', payload);
        toast.success(editing ? 'Semester updated.' : 'Semester added.');
      } else if (level === 4 && !hasSemesters) {
        await client.post('/academic-year-subjects', { academic_year_id: year, subject_id: form.subject_id });
        toast.success('Subject added to this year.');
      } else if (level === 5) {
        await client.post('/academic-year-subjects', { academic_year_id: year, semester_id: semester, subject_id: form.subject_id });
        toast.success('Subject added to this semester.');
      } else if (level === 6) {
        const payload = { academic_year_subject_id: subject, title: form.title, description: form.description, chapter_order: parseInt(form.chapter_order) || 1 };
        editing ? await client.put(`/chapters/${editing.id}`, payload) : await client.post('/chapters', payload);
        toast.success(editing ? 'Chapter updated.' : 'Chapter added.');
      } else if (level === 7) {
        const payload = { chapter_id: chapter, type: form.type, title: form.title, url: form.url, description: form.description };
        editing ? await client.put(`/learning-resources/${editing.id}`, payload) : await client.post('/learning-resources', payload);
        toast.success(editing ? 'Resource updated.' : 'Resource added.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSubject(e) {
    e.preventDefault();
    setCreateSubjectSaving(true);
    try {
      const assignment = { academic_year_id: year };
      if (semester) assignment.semester_id = semester;
      await client.post('/subjects', {
        name: createSubjectForm.name,
        subject_code: createSubjectForm.subject_code || null,
        university_id: uni,
        stream_id: stream,
        assignments: [assignment],
      });
      toast.success('Subject created and assigned.');
      setCreateSubjectOpen(false);
      setCreateSubjectForm({ name: '', subject_code: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setCreateSubjectSaving(false);
    }
  }

  function openAddSemester(yearItem) {
    setSemTargetYear(yearItem);
    setSemForm({ name: '', semester_order: String(Number(yearItem.semester_count) + 1) });
    setSemDialogOpen(true);
  }

  async function handleSemesterSubmit(e) {
    e.preventDefault();
    setSemSaving(true);
    try {
      await client.post('/semesters', {
        academic_year_id: semTargetYear.id,
        name: semForm.name,
        semester_order: parseInt(semForm.semester_order) || 1,
      });
      toast.success('Semester added.');
      setSemDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSemSaving(false);
    }
  }

  async function handleDeactivate(item) {
    const label = item.name || item.title || item.subject_name || 'this item';
    const isRemove = level === 4 || level === 5;
    const ok = await confirm({
      title: isRemove ? 'Remove subject?' : 'Deactivate?',
      description: `Are you sure you want to ${isRemove ? 'remove' : 'deactivate'} "${label}"?`,
      confirmLabel: isRemove ? 'Remove' : 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      if (level === 3) await client.delete(`/academic-years/${item.id}`);
      else if (level === 4 && hasSemesters) await client.delete(`/semesters/${item.id}`);
      else if (level === 4 || level === 5) {
        await client.delete(`/academic-year-subjects/${item.id}`);
        toast.success('Subject removed.');
        load();
        return;
      }
      else if (level === 6) await client.delete(`/chapters/${item.id}`);
      else if (level === 7) await client.delete(`/learning-resources/${item.id}`);
      toast.success('Deactivated.');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed.'); }
  }

  async function handleActivate(item) {
    try {
      if (level === 3) await client.patch(`/academic-years/${item.id}/activate`);
      else if (level === 4 && hasSemesters) await client.patch(`/semesters/${item.id}/activate`);
      else if (level === 6) await client.patch(`/chapters/${item.id}/activate`);
      else if (level === 7) await client.patch(`/learning-resources/${item.id}/activate`);
      toast.success('Activated.');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed.'); }
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────

  const crumbs = [
    uni      ? { label: uniLabel,      onClick: () => goToLevel(1) } : null,
    stream   ? { label: streamLabel,   onClick: () => goToLevel(2) } : null,
    batch    ? { label: batchLabel,    onClick: () => goToLevel(3) } : null,
    year     ? { label: yearLabel,     onClick: () => goToLevel(4) } : null,
    semester ? { label: semesterLabel, onClick: () => goToLevel(5) } : null,
    subject  ? { label: subjectLabel,  onClick: () => goToLevel(6) } : null,
    chapter  ? { label: chapterLabel,  onClick: null } : null,
  ].filter(Boolean);

  // ── Derived title / add button label ──────────────────────────────────────

  function pageTitle() {
    if (level === 0) return 'Select a University';
    if (level === 1) return 'Select a Stream / Course';
    if (level === 2) return 'Select a Batch';
    if (level === 3) return 'Academic Years';
    if (level === 4) return hasSemesters ? 'Semesters' : 'Subjects in this Year';
    if (level === 5) return 'Subjects in this Semester';
    if (level === 6) return 'Chapters';
    if (level === 7) return 'Learning Resources';
    return '';
  }

  function addLabel() {
    if (level === 0) return '+ Add University';
    if (level === 1) return '+ Add Stream';
    if (level === 2) return '+ Add Batch';
    if (level === 3) return '+ Add Year';
    if (level === 4 && hasSemesters) return '+ Add Semester';
    if (level === 4 || level === 5) return '+ Assign Subject';
    if (level === 6) return '+ Add Chapter';
    if (level === 7) return '+ Add Resource';
    return '';
  }

  // University / Stream / Batch creation is admin-only on the backend.
  const canAdd = level >= 3 || isAdmin();

  // Show a secondary "Create new subject" button at the subject levels (admin only — POST /subjects is admin-restricted).
  const canCreateSubject = isAdmin() && (level === 4 ? !hasSemesters : level === 5);

  // ── Row rendering ──────────────────────────────────────────────────────────

  function renderRow(item) {
    // Universities
    if (level === 0) return (
      <TableRow key={item.id} className="cursor-pointer" onClick={() => drillInto('uni', item.id, item.name)}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell className="text-slate-500">{item.short_code || '—'}</TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-slate-400 text-xs">Click to explore →</TableCell>
      </TableRow>
    );

    // Streams
    if (level === 1) return (
      <TableRow key={item.id} className="cursor-pointer" onClick={() => drillInto('stream', item.id, item.name)}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-slate-400 text-xs">Click to explore →</TableCell>
      </TableRow>
    );

    // Batches
    if (level === 2) return (
      <TableRow key={item.id} className="cursor-pointer" onClick={() => drillInto('batch', item.id, item.name)}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell className="text-slate-500">{item.stream_name || '—'}</TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-slate-400 text-xs">Click to explore →</TableCell>
      </TableRow>
    );

    // Academic Years
    if (level === 3) return (
      <TableRow key={item.id} className={`cursor-pointer ${!item.is_active ? 'opacity-50' : ''}`}>
        <TableCell className="font-medium" onClick={() => item.is_active && drillInto('year', item.id, item.name)}>
          {item.year_order}. {item.name}
        </TableCell>
        <TableCell onClick={() => item.is_active && drillInto('year', item.id, item.name)}>
          {Number(item.semester_count) > 0
            ? <span className="text-xs text-indigo-600 dark:text-indigo-400">{item.semester_count} semester{item.semester_count > 1 ? 's' : ''}</span>
            : <span className="text-xs text-slate-400">Direct subjects</span>
          }
        </TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-right space-x-2">
          {item.is_active && (
            <Button size="sm" variant="outline" className="text-indigo-600 dark:text-indigo-400" onClick={() => openAddSemester(item)}>+ Semester</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
          {item.is_active
            ? <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeactivate(item)}>Deactivate</Button>
            : <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleActivate(item)}>Activate</Button>
          }
        </TableCell>
      </TableRow>
    );

    // Level 4: Semesters (when hasSemesters)
    if (level === 4 && hasSemesters) return (
      <TableRow key={item.id} className={`cursor-pointer ${!item.is_active ? 'opacity-50' : ''}`}>
        <TableCell className="font-medium" onClick={() => item.is_active && drillInto('semester', item.id, item.name)}>
          {item.semester_order}. {item.name}
        </TableCell>
        <TableCell className="text-slate-500 text-sm" onClick={() => item.is_active && drillInto('semester', item.id, item.name)}>
          {item.subject_count} subject{item.subject_count !== 1 ? 's' : ''}
        </TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-right space-x-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
          {item.is_active
            ? <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeactivate(item)}>Deactivate</Button>
            : <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleActivate(item)}>Activate</Button>
          }
        </TableCell>
      </TableRow>
    );

    // Level 4 (no semesters) or Level 5: Subjects
    if (level === 4 || level === 5) return (
      <TableRow key={item.id} className="cursor-pointer">
        <TableCell className="font-medium" onClick={() => drillInto('subject', item.id, item.subject_name)}>{item.subject_name}</TableCell>
        <TableCell className="text-slate-500" onClick={() => drillInto('subject', item.id, item.subject_name)}>{item.subject_code || '—'}</TableCell>
        <TableCell className="text-slate-400 text-xs" onClick={() => drillInto('subject', item.id, item.subject_name)}>Click to view chapters →</TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeactivate(item)}>Remove</Button>
        </TableCell>
      </TableRow>
    );

    // Chapters
    if (level === 6) return (
      <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
        <TableCell className="text-slate-500 w-10 cursor-pointer" onClick={() => item.is_active && drillInto('chapter', item.id, item.title)}>{item.chapter_order}.</TableCell>
        <TableCell className="font-medium cursor-pointer" onClick={() => item.is_active && drillInto('chapter', item.id, item.title)}>{item.title}</TableCell>
        <TableCell className="text-slate-500 max-w-xs truncate cursor-pointer" onClick={() => item.is_active && drillInto('chapter', item.id, item.title)}>{item.description || '—'}</TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-right space-x-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
          {item.is_active
            ? <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeactivate(item)}>Deactivate</Button>
            : <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleActivate(item)}>Activate</Button>
          }
        </TableCell>
      </TableRow>
    );

    // Resources
    if (level === 7) return (
      <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
        <TableCell>
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_COLORS[item.type] || ''}`}>
            {RESOURCE_TYPES.find((t) => t.value === item.type)?.label || item.type}
          </span>
        </TableCell>
        <TableCell className="font-medium">{item.title}</TableCell>
        <TableCell className="max-w-xs">
          {item.url
            ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate block max-w-xs" onClick={(e) => e.stopPropagation()}>{item.url}</a>
            : <span className="text-slate-400 text-sm">No link</span>
          }
        </TableCell>
        <TableCell className="text-slate-500 max-w-xs truncate">{item.description || '—'}</TableCell>
        <TableCell><Badge variant="outline" className={item.is_active ? 'text-green-700 border-green-300' : 'text-slate-500 border-slate-300'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
        <TableCell className="text-right space-x-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
          {item.is_active
            ? <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeactivate(item)}>Deactivate</Button>
            : <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleActivate(item)}>Activate</Button>
          }
        </TableCell>
      </TableRow>
    );

    return null;
  }

  function renderTableHead() {
    if (level === 0) return <TableRow><TableHead>University</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>;
    if (level === 1) return <TableRow><TableHead>Stream / Course</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>;
    if (level === 2) return <TableRow><TableHead>Batch</TableHead><TableHead>Stream</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>;
    if (level === 3) return <TableRow><TableHead>Academic Year</TableHead><TableHead>Semesters</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>;
    if (level === 4 && hasSemesters) return <TableRow><TableHead>Semester</TableHead><TableHead>Subjects</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>;
    if (level === 4 || level === 5) return <TableRow><TableHead>Subject</TableHead><TableHead>Code</TableHead><TableHead /><TableHead className="text-right">Actions</TableHead></TableRow>;
    if (level === 6) return <TableRow><TableHead className="w-10">#</TableHead><TableHead>Chapter Title</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>;
    if (level === 7) return <TableRow><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>Link</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>;
    return null;
  }

  // ── Dialog content ─────────────────────────────────────────────────────────

  function renderDialogContent() {
    if (level === 0) return (
      <>
        <div className="space-y-1"><Label>University Name *</Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. EdDream Institute" required /></div>
        <div className="space-y-1"><Label>Short Code *</Label><Input value={form.short_code || ''} onChange={(e) => setForm({ ...form, short_code: e.target.value })} placeholder="e.g. EI" required /></div>
      </>
    );
    if (level === 1) return (
      <div className="space-y-1"><Label>Stream / Course Name *</Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. B.Com" required /></div>
    );
    if (level === 2) return (
      <div className="space-y-1"><Label>Batch Name *</Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Batch 2024–2027" required /></div>
    );
    if (level === 3) return (
      <>
        <div className="space-y-1">
          <Label>Name *</Label>
          <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. First Year" required />
        </div>
        <div className="space-y-1">
          <Label>Display Order</Label>
          <Input type="number" min="1" value={form.year_order || ''} onChange={(e) => setForm({ ...form, year_order: e.target.value })} />
        </div>
      </>
    );

    if (level === 4 && hasSemesters) return (
      <>
        <div className="space-y-1">
          <Label>Semester Name *</Label>
          <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Semester 1" required />
        </div>
        <div className="space-y-1">
          <Label>Display Order</Label>
          <Input type="number" min="1" value={form.semester_order || ''} onChange={(e) => setForm({ ...form, semester_order: e.target.value })} />
        </div>
      </>
    );

    if (level === 4 || level === 5) return (
      <div className="space-y-1">
        <Label>Subject *</Label>
        <Select value={form.subject_id || ''} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select a subject" /></SelectTrigger>
          <SelectContent>
            {availableSubjects.length === 0
              ? <SelectItem value="__none" disabled>No more subjects available</SelectItem>
              : availableSubjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.subject_code ? ` (${s.subject_code})` : ''}</SelectItem>)
            }
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 mt-1">Only subjects for this university that aren't already in this year are shown.</p>
      </div>
    );

    if (level === 6) return (
      <>
        <div className="space-y-1">
          <Label>Chapter Title *</Label>
          <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Journal Entries" required />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional description" />
        </div>
        <div className="space-y-1">
          <Label>Order</Label>
          <Input type="number" min="1" value={form.chapter_order || ''} onChange={(e) => setForm({ ...form, chapter_order: e.target.value })} />
        </div>
      </>
    );

    if (level === 7) return (
      <>
        <div className="space-y-1">
          <Label>Type *</Label>
          <Select value={form.type || ''} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {RESOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Title *</Label>
          <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Introduction Notes" required />
        </div>
        <div className="space-y-1">
          <Label>Link / URL</Label>
          <Input value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </div>
      </>
    );

    return null;
  }

  function dialogTitle() {
    if (level === 0) return 'Add University';
    if (level === 1) return 'Add Stream / Course';
    if (level === 2) return 'Add Batch';
    if (level === 3) return editing ? 'Edit Academic Year' : 'Add Academic Year';
    if (level === 4 && hasSemesters) return editing ? 'Edit Semester' : 'Add Semester';
    if (level === 4 || level === 5) return 'Assign Existing Subject';
    if (level === 6) return editing ? 'Edit Chapter' : 'Add Chapter';
    if (level === 7) return editing ? 'Edit Resource' : 'Add Learning Resource';
    return '';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Curriculum</h1>

      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 text-sm">
          <button onClick={() => goToLevel(0)} className="text-indigo-600 dark:text-indigo-400 hover:underline">All Universities</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-slate-400">/</span>
              {c.onClick
                ? <button onClick={c.onClick} className="text-indigo-600 dark:text-indigo-400 hover:underline">{c.label}</button>
                : <span className="text-slate-700 dark:text-slate-200 font-medium">{c.label}</span>
              }
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">
            {pageTitle()}
            {items.length > 0 && <span className="ml-2 text-slate-400 font-normal text-sm">({items.length})</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {canCreateSubject && (
              <Button size="sm" variant="outline" onClick={() => { setCreateSubjectForm({ name: '', subject_code: '' }); setCreateSubjectOpen(true); }}>
                + Create Subject
              </Button>
            )}
            {canAdd && <Button size="sm" onClick={openAdd}>{addLabel()}</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Nothing found here.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>{renderTableHead()}</TableHeader>
                <TableBody>{items.map((item) => renderRow(item))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{dialogTitle()}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {renderDialogContent()}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Semester dialog — triggered from an Academic Year row */}
      <Dialog open={semDialogOpen} onOpenChange={setSemDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Semester{semTargetYear ? ` — ${semTargetYear.name}` : ''}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSemesterSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Semester Name *</Label>
              <Input value={semForm.name} onChange={(e) => setSemForm({ ...semForm, name: e.target.value })} placeholder="e.g. Semester 1" required />
            </div>
            <div className="space-y-1">
              <Label>Display Order</Label>
              <Input type="number" min="1" value={semForm.semester_order} onChange={(e) => setSemForm({ ...semForm, semester_order: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSemDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={semSaving}>{semSaving ? 'Saving...' : 'Add Semester'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create new Subject dialog — creates a subject and assigns it to the current year/semester */}
      <Dialog open={createSubjectOpen} onOpenChange={setCreateSubjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Subject</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubject} className="space-y-4">
            <div className="space-y-1">
              <Label>Subject Name *</Label>
              <Input value={createSubjectForm.name} onChange={(e) => setCreateSubjectForm({ ...createSubjectForm, name: e.target.value })} placeholder="e.g. Financial Accounting" required />
            </div>
            <div className="space-y-1">
              <Label>Subject Code</Label>
              <Input value={createSubjectForm.subject_code} onChange={(e) => setCreateSubjectForm({ ...createSubjectForm, subject_code: e.target.value })} placeholder="e.g. BCOM101" />
            </div>
            <p className="text-xs text-slate-400">
              The subject will be created and assigned to {semesterLabel ? `${yearLabel} · ${semesterLabel}` : yearLabel} of this batch.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateSubjectOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createSubjectSaving}>{createSubjectSaving ? 'Saving...' : 'Create & Assign'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
