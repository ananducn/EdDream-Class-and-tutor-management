import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import client from '@/api/client';
import { toast } from 'sonner';

function chapterStatus(ch) {
  if (!ch.chapter_id) return null;
  if (ch.recorded > 0) return 'recorded';
  if (ch.total_classes > 0) return 'not_recorded';
  return 'no_classes';
}

function StatusChip({ status }) {
  const map = {
    recorded:     'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    not_recorded: 'bg-red-100  dark:bg-red-900  text-red-800  dark:text-red-200',
    no_classes:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  };
  const label = {
    recorded:     'Recorded',
    not_recorded: 'Not Recorded',
    no_classes:   'No Classes',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function StatCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    green: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300',
    red:   'border-red-200   dark:border-red-800   bg-red-50   dark:bg-red-950   text-red-700   dark:text-red-300',
    blue:  'border-blue-200  dark:border-blue-800  bg-blue-50  dark:bg-blue-950  text-blue-700  dark:text-blue-300',
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

export default function NIOSRecordingOverviewPage() {
  const [universities, setUniversities] = useState([]);
  const [batches,      setBatches]      = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);

  const [selUni,   setSelUni]   = useState('');
  const [selBatch, setSelBatch] = useState('');

  const [overviewData, setOverviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    Promise.all([
      client.get('/nios/universities'),
      client.get('/nios/batches'),
    ]).then(([u, b]) => {
      setUniversities(u.data);
      setBatches(b.data);
      setFilteredBatches(b.data);
    }).catch(() => toast.error('Failed to load dropdowns.'));
  }, []);

  function handleUniChange(v) {
    setSelUni(v); setSelBatch('');
    setFilteredBatches(v ? batches.filter((b) => String(b.nios_university_id) === v) : batches);
    setOverviewData([]); setLoaded(false);
  }

  async function load() {
    if (!selBatch) {
      toast.error('Please select a batch.');
      return;
    }
    setLoading(true);
    try {
      const res = await client.get('/nios/classes/chapter-recording-overview', {
        params: { nios_batch_id: selBatch },
      });
      setOverviewData(res.data);
      setLoaded(true);
    } catch {
      toast.error('Failed to load recording overview.');
    } finally {
      setLoading(false);
    }
  }

  const bySubject = useMemo(() => {
    const map = {};
    for (const row of overviewData) {
      const key = row.nios_batch_subject_id;
      if (!map[key]) {
        map[key] = {
          nios_subject_id: row.nios_subject_id,
          subject_name: row.subject_name,
          chapters: [],
        };
      }
      if (row.chapter_id) map[key].chapters.push(row);
    }
    return Object.values(map);
  }, [overviewData]);

  const allChapters = useMemo(() => overviewData.filter((r) => r.chapter_id), [overviewData]);

  const summary = useMemo(() => ({
    total:       allChapters.length,
    recorded:    allChapters.filter((r) => r.recorded > 0).length,
    notRecorded: allChapters.filter((r) => r.recorded === 0 && r.total_classes > 0).length,
    noClasses:   allChapters.filter((r) => r.total_classes === 0).length,
  }), [allChapters]);

  const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">NIOS Recording Overview</h1>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>NIOS University</Label>
              <Select value={selUni} onValueChange={handleUniChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  {universities.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Batch *</Label>
              <Select value={selBatch} onValueChange={(v) => { setSelBatch(v); setOverviewData([]); setLoaded(false); }} disabled={filteredBatches.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {filteredBatches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={load} disabled={!selBatch || loading}>
              {loading ? 'Loading…' : 'Load Overview'}
            </Button>
            {loaded && (
              <Button size="sm" variant="outline" onClick={() => { setOverviewData([]); setLoaded(false); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!loaded && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            Select a batch and click Load Overview.
          </CardContent>
        </Card>
      )}

      {loaded && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Chapters" value={summary.total}       color="slate" />
            <StatCard label="Recorded"       value={summary.recorded}    color="green" />
            <StatCard label="Not Recorded"   value={summary.notRecorded} color="red"   sub="classes exist but unrecorded" />
            <StatCard label="No Classes Yet" value={summary.noClasses}   color="blue"  sub="no class added for chapter" />
          </div>

          {bySubject.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                No subjects found for this batch.
              </CardContent>
            </Card>
          ) : (
            bySubject.map((subj) => {
              const recCount = subj.chapters.filter((ch) => ch.recorded > 0).length;
              return (
                <Card key={subj.nios_subject_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base text-slate-900 dark:text-slate-100">
                        {subj.subject_name}
                      </CardTitle>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {recCount} / {subj.chapters.length} chapters recorded
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {subj.chapters.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No chapters added for this subject.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TH}>#</TableHead>
                            <TableHead className={TH}>Chapter</TableHead>
                            <TableHead className={`${TH} text-center`}>Classes</TableHead>
                            <TableHead className={`${TH} text-center`}>Recorded</TableHead>
                            <TableHead className={TH}>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subj.chapters.map((ch) => {
                            const st = chapterStatus(ch);
                            return (
                              <TableRow key={ch.chapter_id}>
                                <TableCell className="text-slate-400 dark:text-slate-500 tabular-nums w-8">
                                  {ch.chapter_order}
                                </TableCell>
                                <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                                  {ch.chapter_title}
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                                  {ch.total_classes}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  <span className={ch.recorded > 0 ? 'text-green-700 dark:text-green-400 font-medium' : 'text-slate-400 dark:text-slate-500'}>
                                    {ch.recorded}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <StatusChip status={st} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
