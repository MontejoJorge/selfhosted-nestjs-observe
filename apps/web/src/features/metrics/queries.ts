import { apiGet } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import type {
  CustomMetricSummary,
  RuntimeSeriesPoint,
} from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export const runtimeMetricsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['metrics', 'runtime', scope],
    queryFn: ({ signal }) =>
      apiGet<RuntimeSeriesPoint[]>('/metrics/runtime', { ...scope }, signal),
  });

export const customMetricsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['metrics', 'custom', scope],
    queryFn: ({ signal }) =>
      apiGet<CustomMetricSummary[]>('/metrics/custom', { ...scope }, signal),
  });
