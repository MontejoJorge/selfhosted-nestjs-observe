import { api } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { previousWindow } from '@/lib/stats';
import { queryOptions } from '@tanstack/react-query';

/** Narrows the overview to one operation or one job (the detail pages). */
export interface OverviewFilters {
  operationId?: string;
  queue?: string;
  name?: string;
}

export const overviewQueryOptions = (
  scope: Scope,
  filters: OverviewFilters = {},
) =>
  queryOptions({
    queryKey: ['overview', scope, filters],
    queryFn: ({ signal }) =>
      api.overview.getOverview({ ...scope, ...filters }, { signal }),
  });

/**
 * The same overview for the window right before the current range, for the
 * "since last period" trends. The window is fixed when the query first runs.
 */
export const previousOverviewQueryOptions = (
  scope: Scope,
  filters: OverviewFilters = {},
) =>
  queryOptions({
    queryKey: ['overview', 'previous', scope, filters],
    queryFn: ({ signal }) =>
      api.overview.getOverview(
        { ...scope, ...filters, ...previousWindow(scope) },
        { signal },
      ),
    staleTime: 5 * 60_000,
  });
