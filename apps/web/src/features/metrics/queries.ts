import { api } from '@/lib/api/client';
import type { TimeRange } from '@/lib/api/generated/api';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

/** Runtime series are per service, so `service` is required. */
export const runtimeMetricsQueryOptions = (scope: {
  service: string;
  range: TimeRange;
}) =>
  queryOptions({
    queryKey: ['metrics', 'runtime', scope],
    queryFn: ({ signal }) => api.metrics.getRuntimeMetrics(scope, { signal }),
  });

export const customMetricsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['metrics', 'custom', scope],
    queryFn: ({ signal }) => api.metrics.listCustomMetrics(scope, { signal }),
  });
