import { api } from '@/lib/api/client';
import type { ErrorSource } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

export interface ErrorFilters {
  source?: ErrorSource;
  q?: string;
}

export const errorGroupsQueryOptions = (scope: Scope, filters: ErrorFilters) =>
  pagedQueryOptions(['errors', 'list', scope, filters], (page, signal) =>
    api.errors.listErrorGroups({ ...scope, ...filters, ...page }, { signal }),
  );

/** The timeline and occurrences only cover `scope.range`; the count is all-time. */
export const errorGroupQueryOptions = (id: string, scope: Scope) =>
  queryOptions({
    queryKey: ['errors', 'detail', id, scope],
    queryFn: ({ signal }) =>
      api.errors.getErrorGroup({ id, ...scope }, { signal }),
  });
