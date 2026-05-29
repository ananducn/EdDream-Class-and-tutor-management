import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import client from '@/api/client';

export default function TimetableUniversityPage() {
  const { universityId } = useParams();
  const navigate = useNavigate();

  const [universityName, setUniversityName] = useState('');
  const [batches, setBatches] = useState([]);
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [timetableCountByBatch, setTimetableCountByBatch] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [uRes, bRes, sRes, subRes, tRes] = await Promise.all([
          client.get('/universities'),
          client.get('/batches', { params: { university_id: universityId } }),
          client.get('/streams', { params: { university_id: universityId } }),
          client.get('/subjects', { params: { university_id: universityId } }),
          client.get('/timetables'),
        ]);

        const uni = uRes.data.find((u) => String(u.id) === universityId);
        setUniversityName(uni?.name || '');
        setBatches(bRes.data);
        setStreams(sRes.data);
        setSubjects(subRes.data);

        const tc = {};
        tRes.data
          .filter((t) => String(t.university_id) === universityId)
          .forEach((t) => {
            if (t.batch_id) tc[t.batch_id] = (tc[t.batch_id] || 0) + 1;
          });
        setTimetableCountByBatch(tc);
      } catch {
        toast.error('Failed to load university data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [universityId]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate('/timetable')}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          Timetable
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {loading ? '...' : universityName}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
      ) : (
        <>
          {/* Batches */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Batches</h2>
            {batches.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No batches found for this university.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {batches.map((batch) => {
                  const tc = timetableCountByBatch[batch.id] || 0;
                  return (
                    <button
                      key={batch.id}
                      onClick={() => navigate(`/timetable/${universityId}/${batch.id}`)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                            {batch.name}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {batch.stream_name && (
                              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                                {batch.stream_name}
                              </span>
                            )}
                            {batch.semester && (
                              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                                Sem {batch.semester}
                              </span>
                            )}
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

          {/* Streams */}
          {streams.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Streams</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {streams.map((stream) => (
                  <div
                    key={stream.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
                  >
                    <p className="font-medium text-slate-900 dark:text-slate-100">{stream.name}</p>
                    {stream.academic_year && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {stream.academic_year}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Subjects */}
          {subjects.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Subjects</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
                  >
                    <p className="font-medium text-slate-900 dark:text-slate-100">{subject.name}</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                      {subject.subject_code && <span>{subject.subject_code}</span>}
                      {subject.stream_name && <span>· {subject.stream_name}</span>}
                      {subject.semester && <span>· Sem {subject.semester}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
