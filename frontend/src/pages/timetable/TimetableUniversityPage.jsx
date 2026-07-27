import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import client from '@/api/client';
import { SkeletonCards } from '@/components/Skeletons';

export default function TimetableUniversityPage() {
  const { universityId } = useParams();
  const navigate = useNavigate();

  const [universityName, setUniversityName] = useState('');
  const [streams, setStreams] = useState([]);
  const [batchCountByStream, setBatchCountByStream] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [uRes, sRes, bRes] = await Promise.all([
          client.get('/universities'),
          client.get('/streams', { params: { university_id: universityId } }),
          client.get('/batches', { params: { university_id: universityId } }),
        ]);

        const uni = uRes.data.find((u) => String(u.id) === universityId);
        setUniversityName(uni?.name || '');
        setStreams(sRes.data);

        const bc = {};
        bRes.data.forEach((b) => {
          if (b.stream_id) bc[b.stream_id] = (bc[b.stream_id] || 0) + 1;
        });
        setBatchCountByStream(bc);
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
        <SkeletonCards count={6} />
      ) : (
        <>
          {/* Streams */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Streams</h2>
            {streams.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No streams found for this university.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {streams.map((stream) => {
                  const bc = batchCountByStream[stream.id] || 0;
                  return (
                    <button
                      key={stream.id}
                      onClick={() => navigate(`/timetable/${universityId}/${stream.id}`)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                            {stream.name}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                              {bc} {bc === 1 ? 'batch' : 'batches'}
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
