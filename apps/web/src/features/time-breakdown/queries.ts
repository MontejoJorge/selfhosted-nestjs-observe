import { api } from '@/lib/api/client';
import type { ExecutionSource } from '@/lib/api/generated/api';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

/** Narrows the breakdown to requests or jobs, one operation or one job. */
export interface TimeBreakdownFilters {
  source?: ExecutionSource;
  operationId?: string;
  queue?: string;
  name?: string;
}

/** One class.method row of the breakdown, as picked for the drill-down. */
export interface SpanTarget {
  className: string;
  methodName: string;
  origin?: string;
}

export const timeBreakdownQueryOptions = (
  scope: Scope,
  filters: TimeBreakdownFilters,
) =>
  queryOptions({
    queryKey: ['time-breakdown', 'items', scope, filters],
    queryFn: ({ signal }) =>
      api.timeBreakdown.getTimeBreakdown({ ...scope, ...filters }, { signal }),
  });

export const slowestSpansQueryOptions = (
  scope: Scope,
  filters: TimeBreakdownFilters,
  target: SpanTarget,
) =>
  queryOptions({
    queryKey: ['time-breakdown', 'spans', scope, filters, target],
    queryFn: ({ signal }) =>
      api.timeBreakdown.listSlowestSpans(
        { ...scope, ...filters, ...target },
        { signal },
      ),
  });
