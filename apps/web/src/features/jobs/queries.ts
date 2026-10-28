import { api } from '@/lib/api/client';
import type { JobStatus } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

export interface JobFilters {
  queue?: string;
  name?: string;
  status?: JobStatus;
  traceId?: string;
}

export const jobStatsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['jobs', 'queues', scope],
    queryFn: ({ signal }) => api.jobs.listQueues(scope, { signal }),
  });

export const jobListQueryOptions = (scope: Scope, filters: JobFilters) =>
  pagedQueryOptions(['jobs', 'list', scope, filters], (page, signal) =>
    api.jobs.listJobs({ ...scope, ...filters, ...page }, { signal }),
  );

export const jobDetailQueryOptions = (project: string, id: string) =>
  queryOptions({
    queryKey: ['jobs', 'detail', project, id],
    queryFn: ({ signal }) => api.jobs.getJob({ id, project }, { signal }),
    staleTime: Infinity,
  });
