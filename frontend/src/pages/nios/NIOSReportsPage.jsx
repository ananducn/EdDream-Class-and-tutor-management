import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import client from '@/api/client';

const TH = 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400';

function DateRange({ dateFrom, dateTo, onFromChange, onToChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-slate-500 dark:text-slate-400">From</Label>
        <Input type="date" value={dateFrom} onChange={(e) => onFromChange(e.target.value)} className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-slate-500 dark:text-slate-400">To</Label>
        <Input type="date" value={dateTo} onChange={(e) => onToChange(e.target.value)} className="w-40" />
      </div>
    </div>
  );
}

function EmptyState({ children = 'No NIOS data for the selected period.' }) {
  return <p className="text-sm text-slate-500 dark:text-slate-400 py-4">{children}</p>;
}

function useReport(endpoint, { dated = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run(dateFrom, dateTo) {
    if (dated && (!dateFrom || !dateTo)) { toast.error('Please select a date range.'); return; }
    setLoading(true);
    try {
      const res = await client.get(endpoint, {
        params: dated ? { date_from: dateFrom, date_to: dateTo } : {},
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, run };
}

async function exportCSV(type, dateFrom, dateTo, { dated = true } = {}) {
  if (dated && (!dateFrom || !dateTo)) { toast.error('Please select a date range.'); return; }
  try {
    const res = await client.get('/nios/reports/export', {
      params: dated ? { type, date_from: dateFrom, date_to: dateTo } : { type },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nios_${type}_report.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error('Export failed.');
  }
}

function FacultyTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/nios/reports/faculty');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('faculty', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      <p className="text-xs text-slate-400">
        NIOS teaching only. A class shared across batches counts once.
      </p>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={`${TH} text-right`}>Classes</TableHead>
                <TableHead className={`${TH} text-right`}>Total Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.faculty_name}</TableCell>
                  <TableCell className="text-right">{row.total_classes}</TableCell>
                  <TableCell className="text-right">{Number(row.total_hours).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

// Recording progress is a snapshot of the whole NIOS syllabus, not a date-ranged
// count of sessions, so this tab has no date pickers.
function RecordingsTab() {
  const { data, loading, run } = useReport('/nios/reports/recordings', { dated: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Button onClick={() => run()} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('recordings', null, null, { dated: false })} disabled={loading}>Export CSV</Button>
      </div>
      <p className="text-xs text-slate-400">
        Snapshot of the whole NIOS syllabus. A subject shared by several streams is counted once.
      </p>
      {data && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Recorded', value: data.total_recorded },
            { label: 'Not Recorded', value: data.total_not_recorded },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4 flex flex-col items-center gap-1">
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value ?? 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadsTab() {
  const { data, loading, run } = useReport('/nios/reports/uploads', { dated: false });
  const tick = (val) => (val ? '✓' : '—');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Button onClick={() => run()} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('uploads', null, null, { dated: false })} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState>No NIOS recordings uploaded yet.</EmptyState> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Date</TableHead>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={TH}>Subject</TableHead>
                <TableHead className={TH}>Chapter</TableHead>
                <TableHead className={`${TH} text-center`}>Student App</TableHead>
                <TableHead className={`${TH} text-center`}>YouTube</TableHead>
                <TableHead className={`${TH} text-center`}>GDrive</TableHead>
                <TableHead className={`${TH} text-center`}>Hard Disk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date || '—'}</TableCell>
                  <TableCell>{row.faculty_name}</TableCell>
                  <TableCell>{row.subject_name}</TableCell>
                  <TableCell>{row.chapter_title}</TableCell>
                  <TableCell className="text-center">{tick(row.upload_student_app)}</TableCell>
                  <TableCell className="text-center">{tick(row.upload_youtube)}</TableCell>
                  <TableCell className="text-center">{tick(row.upload_gdrive)}</TableCell>
                  <TableCell className="text-center">{tick(row.upload_harddisk)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

// University → Stream → Subject. The stream level is what makes a board's
// Science and Commerce teaching separable, which the main app's equivalent
// report has no notion of.
function StreamTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/nios/reports/stream');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('stream', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>University / Stream / Subject</TableHead>
                <TableHead className={`${TH} text-right`}>Classes</TableHead>
                <TableHead className={`${TH} text-right`}>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((uni) => (
                <Fragment key={uni.university_name}>
                  <TableRow className="bg-slate-50 dark:bg-slate-800">
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{uni.university_name}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">{uni.total_classes}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">{Number(uni.total_hours).toFixed(2)}</TableCell>
                  </TableRow>
                  {uni.streams.map((st) => (
                    <Fragment key={`${uni.university_name}-${st.stream_name}`}>
                      <TableRow>
                        <TableCell className="pl-6 font-medium text-slate-700 dark:text-slate-300">{st.stream_name}</TableCell>
                        <TableCell className="text-right font-medium text-slate-700 dark:text-slate-300">{st.total_classes}</TableCell>
                        <TableCell className="text-right font-medium text-slate-700 dark:text-slate-300">{Number(st.total_hours).toFixed(2)}</TableCell>
                      </TableRow>
                      {st.subjects.map((sub, k) => (
                        <TableRow key={`${uni.university_name}-${st.stream_name}-${k}`}>
                          <TableCell className="pl-12 text-slate-500 dark:text-slate-400">{sub.subject_name}</TableCell>
                          <TableCell className="text-right">{sub.total_classes}</TableCell>
                          <TableCell className="text-right">{Number(sub.total_hours).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

export default function NIOSReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">NIOS Reports</h1>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Generate Report</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="faculty">
            <TabsList className="mb-4">
              <TabsTrigger value="faculty">Faculty</TabsTrigger>
              <TabsTrigger value="recordings">Recordings</TabsTrigger>
              <TabsTrigger value="uploads">Uploads</TabsTrigger>
              <TabsTrigger value="stream">Stream</TabsTrigger>
            </TabsList>
            <TabsContent value="faculty"><FacultyTab /></TabsContent>
            <TabsContent value="recordings"><RecordingsTab /></TabsContent>
            <TabsContent value="uploads"><UploadsTab /></TabsContent>
            <TabsContent value="stream"><StreamTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
