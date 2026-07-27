import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import client from '@/api/client';
import { SkeletonCards } from '@/components/Skeletons';

export default function NIOSTimetablePage() {
  const navigate = useNavigate();
  const [universities, setUniversities] = useState([]);
  const [timetableCountByUni, setTimetableCountByUni] = useState({});
  const [batchCountByUni, setBatchCountByUni] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [uRes, tRes, bRes] = await Promise.all([
          client.get('/nios/universities'),
          client.get('/nios/timetables'),
          client.get('/nios/batches'),
        ]);
        setUniversities(uRes.data);

        const tc = {};
        tRes.data.forEach((t) => {
          if (t.nios_university_id) tc[t.nios_university_id] = (tc[t.nios_university_id] || 0) + 1;
        });
        setTimetableCountByUni(tc);

        const bc = {};
        bRes.data.forEach((b) => {
          if (b.nios_university_id) bc[b.nios_university_id] = (bc[b.nios_university_id] || 0) + 1;
        });
        setBatchCountByUni(bc);
      } catch {
        toast.error('Failed to load NIOS universities.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">NIOS Timetable</h1>

      {loading ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {universities.map((uni) => (
            <button
              key={uni.id}
              onClick={() => navigate(`/nios/timetable/${uni.id}`)}
              className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:border-indigo-400 hover:shadow-md transition-all"
            >
              <p className="font-semibold text-slate-900 dark:text-slate-100 text-base">{uni.name}</p>
              <div className="mt-3 flex gap-4 text-sm text-slate-500 dark:text-slate-400">
                <span>{batchCountByUni[uni.id] || 0} batch{(batchCountByUni[uni.id] || 0) !== 1 ? 'es' : ''}</span>
                <span>{timetableCountByUni[uni.id] || 0} timetable{(timetableCountByUni[uni.id] || 0) !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
