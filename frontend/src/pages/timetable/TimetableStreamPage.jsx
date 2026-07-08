import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import client from '@/api/client';

export default function TimetableStreamPage() {
  const { universityId, streamId } = useParams();
  const navigate = useNavigate();

  const [universityName, setUniversityName] = useState('');
  const [streamName, setStreamName] = useState('');
  const [batches, setBatches] = useState([]);
  const [timetableCountByBatch, setTimetableCountByBatch] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [uRes, sRes, bRes, tRes] = await Promise.all([
          client.get('/universities'),
          client.get('/streams', { params: { university_id: universityId } }),
          client.get('/batches', { params: { stream_id: streamId } }),
          client.get('/timetables'),
        ]);

        setUniversityName(uRes.data.find((u) => String(u.id) === universityId)?.name || '');
        setStreamName(sRes.data.find((s) => String(s.id) === streamId)?.name || '');
        setBatches(bRes.data);

        const tc = {};
        tRes.data
          .filter((t) => String(t.university_id) === universityId)
          .forEach((t) => {
            if (t.batch_id) tc[t.batch_id] = (tc[t.batch_id] || 0) + 1;
          });
        setTimetableCountByBatch(tc);
      } catch {
        toast.error('Failed to load stream data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [universityId, streamId]);

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
        <button
          onClick={() => navigate(`/timetable/${universityId}`)}
          className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          {universityName || '...'}
        </button>
        <span className="text-slate-300 dark:text-slate-600">›</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {loading ? '...' : streamName}
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
                No batches found for this stream.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {batches.map((batch) => {
                  const tc = timetableCountByBatch[batch.id] || 0;
                  return (
                    <button
                      key={batch.id}
                      onClick={() => navigate(`/timetable/${universityId}/${streamId}/${batch.id}`)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                            {batch.name}
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
        </>
      )}
    </div>
  );
}
