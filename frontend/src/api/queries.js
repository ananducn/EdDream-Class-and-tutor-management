import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from './client';

// Shared React Query hooks so reference data (universities, streams, batches,
// faculty, subjects, years, semesters) is fetched once and reused across pages
// instead of every page refetching it on mount. Cached in memory (60s stale by
// default, see main.jsx) and invalidated after writes via useInvalidateData().

function useRef(key, url, params, opts = {}) {
  return useQuery({
    queryKey: ['ref', key, params ?? null],
    queryFn: async () => (await client.get(url, params ? { params } : undefined)).data,
    ...opts,
  });
}

export const useUniversities = () => useRef('universities', '/universities');
export const useFaculty = () => useRef('faculty', '/faculty');
export const useStreams = (params) => useRef('streams', '/streams', params);
export const useBatches = (params) => useRef('batches', '/batches', params);
export const useSubjects = (params) => useRef('subjects', '/subjects', params);

export const useAcademicYears = (streamId) =>
  useQuery({
    queryKey: ['ref', 'academic-years', streamId ?? null],
    queryFn: async () => (await client.get('/academic-years', { params: { stream_id: streamId } })).data,
    enabled: !!streamId,
  });

export const useSemesters = (academicYearId) =>
  useQuery({
    queryKey: ['ref', 'semesters', academicYearId ?? null],
    queryFn: async () => (await client.get('/semesters', { params: { academic_year_id: academicYearId } })).data,
    enabled: !!academicYearId,
  });

// The dashboard summary (moderately expensive aggregation).
export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await client.get('/dashboard/summary')).data,
    staleTime: 30_000,
  });

// Call after any create/update/delete. Broad-by-family invalidation keeps things
// simple and never shows stale data: refetch all reference data plus the derived
// views (classes/timetable/reports/dashboard). The backend also flushes its own
// cache on write, so the refetched data is fresh.
export function useInvalidateData() {
  const qc = useQueryClient();
  return () => {
    ['ref', 'classes', 'timetable', 'reports', 'dashboard', 'curriculum', 'recordings']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}
