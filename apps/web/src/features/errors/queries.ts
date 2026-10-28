import { apiGet } from '@/lib/api/client';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import type {
  ErrorGroup,
  ErrorGroupDetail,
} from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export interface ErrorFilters {
  source?: 'request' | 'job';
}

export const errorGroupsQueryOptions = (scope: Scope, filters: ErrorFilters) =>
  pagedQueryOptions<ErrorGroup>(['errors', 'list', scope, filters], '/errors', {
    ...scope,
    ...filters,
  });

export const errorGroupQueryOptions = (id: string, scope: Scope) =>
  queryOptions({
    queryKey: ['errors', 'detail', id, scope],
    queryFn: ({ signal }) =>
      apiGet<ErrorGroupDetail>(
        `/errors/${encodeURIComponent(id)}`,
        { ...scope },
        signal,
      ),
  });
