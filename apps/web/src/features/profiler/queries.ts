import { api } from '@/lib/api/client';
import { pickWindow, type TimeWindow } from '@/lib/api/scope';
import { previousWindow } from '@/lib/stats';
import { queryOptions } from '@tanstack/react-query';

/** Runtime metrics are per application; `instance` narrows to one node. */
export interface RuntimeScope extends TimeWindow {
  project: string;
  application: string;
  instance?: string;
}

/** The instances of an application with their latest sample in the range. */
export const runtimeInstancesQueryOptions = ({
  project,
  application,
  ...window
}: Omit<RuntimeScope, 'instance'>) =>
  queryOptions({
    queryKey: [
      'profiler',
      'instances',
      project,
      application,
      pickWindow(window),
    ],
    queryFn: ({ signal }) =>
      api.metrics.listRuntimeInstances(
        { project, application, ...pickWindow(window) },
        { signal },
      ),
  });

/** Averages, latest sample and per-bucket series (aggregated across instances without `instance`). */
export const runtimeMetricsQueryOptions = (scope: RuntimeScope) =>
  queryOptions({
    queryKey: ['profiler', 'metrics', scope],
    queryFn: ({ signal }) => api.metrics.getRuntimeMetrics(scope, { signal }),
  });

/** The same metrics for the window before the range, for the trends. */
export const previousRuntimeMetricsQueryOptions = (scope: RuntimeScope) =>
  queryOptions({
    queryKey: ['profiler', 'metrics', 'previous', scope],
    queryFn: ({ signal }) =>
      api.metrics.getRuntimeMetrics(
        { ...scope, ...previousWindow(scope) },
        { signal },
      ),
    staleTime: 5 * 60_000,
  });
