import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import client from '@/api/client';
import { SkeletonCards } from '@/components/Skeletons';

export default function TimetablePage() {
  const navigate = useNavigate();
  const [universities, setUniversities] = useState([]);
  const [timetableCountByUni, setTimetableCountByUni] = useState({});
  const [batchCountByUni, setBatchCountByUni] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [uRes, tRes, bRes] = await Promise.all([
          client.get('/universities'),
          client.get('/timetables'),
          client.get('/batches'),
        ]);
        setUniversities(uRes.data);

        const tc = {};
        tRes.data.forEach((t) => {
          if (t.university_id) tc[t.university_id] = (tc[t.university_id] || 0) + 1;
        });
        setTimetableCountByUni(tc);

        const bc = {};
        bRes.data.forEach((b) => {
          if (b.university_id) bc[b.university_id] = (bc[b.university_id] || 0) + 1;
        });
        setBatchCountByUni(bc);
      } catch {
        toast.error('Failed to load universities.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Timetable</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Select a university to view its timetables.</p>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : universities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No universities found. Add universities in Settings first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {universities.map((uni) => {
            const tc = timetableCountByUni[uni.id] || 0;
            const bc = batchCountByUni[uni.id] || 0;
            return (
              <button
                key={uni.id}
                onClick={() => navigate(`/timetable/${uni.id}`)}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {uni.name}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {bc} {bc === 1 ? 'batch' : 'batches'}
                      </span>
                      <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {tc} {tc === 1 ? 'timetable' : 'timetables'}
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
    </div>
  );
}
