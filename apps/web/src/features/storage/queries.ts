import { api } from '@/lib/api/client';
import type { CreateStorageTrimDto } from '@/lib/api/generated/api';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** How often the trims are polled while one is pending or running. */
const TRIM_POLL_MS = 2_000;

/** Database, tables, day partitions and projects of the whole instance. */
export const storageOverviewQueryOptions = () =>
  queryOptions({
    queryKey: ['storage', 'overview'],
    queryFn: ({ signal }) => api.storage.getStorageOverview({ signal }),
  });

/** Raw telemetry of a project, optionally narrowed to one application. */
export const projectStorageQueryOptions = (
  project: string,
  application: string | undefined,
) =>
  queryOptions({
    queryKey: ['storage', 'project', project, application ?? null],
    queryFn: ({ signal }) =>
      api.projects.getProjectStorage({ project, application }, { signal }),
  });

/** Pending and running trims; polls while there is one. */
export const storageTrimsQueryOptions = (project: string) =>
  queryOptions({
    queryKey: ['storage', 'trims', project],
    queryFn: ({ signal }) =>
      api.projects.listStorageTrims({ project }, { signal }),
    refetchInterval: (query) =>
      query.state.data && query.state.data.length > 0 ? TRIM_POLL_MS : false,
  });

export const createStorageTrimMutation = (project: string) =>
  mutationOptions({
    mutationFn: (body: CreateStorageTrimDto) =>
      api.projects.createStorageTrim({ project }, body),
  });
