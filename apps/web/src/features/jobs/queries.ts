import { apiGet } from '@/lib/api/client';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import type {
  JobDetail,
  JobListItem,
  JobStats,
} from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export interface JobFilters {
  queue?: string;
  name?: string;
  status?: 'completed' | 'failed';
  traceId?: string;
}

export const jobStatsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['jobs', 'queues', scope],
    queryFn: ({ signal }) =>
      apiGet<JobStats[]>('/jobs/queues', { ...scope }, signal),
  });

export const jobListQueryOptions = (scope: Scope, filters: JobFilters) =>
  pagedQueryOptions<JobListItem>(['jobs', 'list', scope, filters], '/jobs', {
    ...scope,
    ...filters,
  });

export const jobDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['jobs', 'detail', id],
    queryFn: ({ signal }) =>
      apiGet<JobDetail>(`/jobs/${encodeURIComponent(id)}`, undefined, signal),
    staleTime: Infinity,
  });
