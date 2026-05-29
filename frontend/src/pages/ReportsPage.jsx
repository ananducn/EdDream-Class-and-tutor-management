import { useState } from 'react';
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

function EmptyState() {
  return <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No data for the selected period.</p>;
}

function useReport(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) { toast.error('Please select a date range.'); return; }
    setLoading(true);
    try {
      const res = await client.get(endpoint, { params: { date_from: dateFrom, date_to: dateTo } });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, run };
}

async function exportCSV(type, dateFrom, dateTo) {
  if (!dateFrom || !dateTo) { toast.error('Please select a date range.'); return; }
  try {
    const res = await client.get('/reports/export', {
      params: { type, date_from: dateFrom, date_to: dateTo },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${type}_report.csv`);
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
  const { data, loading, run } = useReport('/reports/faculty');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('faculty', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={`${TH} text-right`}>Classes</TableHead>
                <TableHead className={`${TH} text-right`}>Total Hours</TableHead>
                <TableHead className={`${TH} text-right`}>Recorded</TableHead>
                <TableHead className={`${TH} text-right`}>Paid</TableHead>
                <TableHead className={`${TH} text-right`}>Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.faculty_name}</TableCell>
                  <TableCell className="text-right">{row.total_classes}</TableCell>
                  <TableCell className="text-right">{Number(row.total_hours).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{row.recorded_classes}</TableCell>
                  <TableCell className="text-right">{row.paid_count}</TableCell>
                  <TableCell className="text-right">{row.pending_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

function RecordingsTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/reports/recordings');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('recordings', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Recorded', value: data.total_recorded },
            { label: 'Not Recorded', value: data.total_not_recorded },
            { label: 'Edited', value: data.total_edited },
            { label: 'Pending Editing', value: data.total_not_edited },
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/reports/uploads');

  const tick = (val) => (val ? '✓' : '—');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('uploads', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Date</TableHead>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={TH}>Subject</TableHead>
                <TableHead className={`${TH} text-center`}>Student App</TableHead>
                <TableHead className={`${TH} text-center`}>YouTube</TableHead>
                <TableHead className={`${TH} text-center`}>GDrive</TableHead>
                <TableHead className={`${TH} text-center`}>Hard Disk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.faculty_name}</TableCell>
                  <TableCell>{row.subject_name}</TableCell>
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

function PaymentTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/reports/payment');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('payment', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Faculty</TableHead>
                <TableHead className={`${TH} text-right`}>Total Hours</TableHead>
                <TableHead className={`${TH} text-right`}>Payable Hours</TableHead>
                <TableHead className={`${TH} text-right`}>Paid Classes</TableHead>
                <TableHead className={`${TH} text-right`}>Pending Classes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.faculty_name}</TableCell>
                  <TableCell className="text-right">{Number(row.total_hours).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{Number(row.payable_hours).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{row.paid_count}</TableCell>
                  <TableCell className="text-right">{row.pending_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

function UniversityTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, run } = useReport('/reports/university');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateRange dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => run(dateFrom, dateTo)} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        <Button variant="outline" onClick={() => exportCSV('university', dateFrom, dateTo)} disabled={loading}>Export CSV</Button>
      </div>
      {data && (
        !data.length ? <EmptyState /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>University</TableHead>
                <TableHead className={TH}>Subject</TableHead>
                <TableHead className={`${TH} text-right`}>Classes</TableHead>
                <TableHead className={`${TH} text-right`}>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((uni) => (
                <>
                  <TableRow key={`uni-${uni.university_name}`} className="bg-slate-50 dark:bg-slate-800">
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100" colSpan={2}>{uni.university_name}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">{uni.total_classes}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">{Number(uni.total_hours).toFixed(2)}</TableCell>
                  </TableRow>
                  {uni.subjects.map((sub, j) => (
                    <TableRow key={`${uni.university_name}-${j}`}>
                      <TableCell />
                      <TableCell className="text-slate-500 dark:text-slate-400 pl-6">{sub.subject_name}</TableCell>
                      <TableCell className="text-right">{sub.total_classes}</TableCell>
                      <TableCell className="text-right">{Number(sub.total_hours).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reports</h1>
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
              <TabsTrigger value="payment">Payment</TabsTrigger>
              <TabsTrigger value="university">University</TabsTrigger>
            </TabsList>
            <TabsContent value="faculty"><FacultyTab /></TabsContent>
            <TabsContent value="recordings"><RecordingsTab /></TabsContent>
            <TabsContent value="uploads"><UploadsTab /></TabsContent>
            <TabsContent value="payment"><PaymentTab /></TabsContent>
            <TabsContent value="university"><UniversityTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
