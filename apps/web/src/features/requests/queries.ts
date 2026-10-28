import { apiGet } from '@/lib/api/client';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import type {
  OperationStats,
  RequestDetail,
  RequestListItem,
} from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export interface RequestFilters {
  operationId?: string;
  status?: 'ok' | 'error';
  minDuration?: number;
  traceId?: string;
}

export const operationsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['requests', 'operations', scope],
    queryFn: ({ signal }) =>
      apiGet<OperationStats[]>('/requests/operations', { ...scope }, signal),
  });

export const requestListQueryOptions = (
  scope: Scope,
  filters: RequestFilters,
) =>
  pagedQueryOptions<RequestListItem>(
    ['requests', 'list', scope, filters],
    '/requests',
    { ...scope, ...filters },
  );

export const requestDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['requests', 'detail', id],
    queryFn: ({ signal }) =>
      apiGet<RequestDetail>(
        `/requests/${encodeURIComponent(id)}`,
        undefined,
        signal,
      ),
    staleTime: Infinity,
  });
