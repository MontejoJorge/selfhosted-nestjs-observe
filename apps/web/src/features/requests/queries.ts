import { api } from '@/lib/api/client';
import type { RequestStatus } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

export interface RequestFilters {
  operationId?: string;
  status?: RequestStatus;
  minDuration?: number;
  traceId?: string;
}

export const operationsQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['requests', 'operations', scope],
    queryFn: ({ signal }) => api.requests.listOperations(scope, { signal }),
  });

export const requestListQueryOptions = (
  scope: Scope,
  filters: RequestFilters,
) =>
  pagedQueryOptions(['requests', 'list', scope, filters], (page, signal) =>
    api.requests.listRequests({ ...scope, ...filters, ...page }, { signal }),
  );

export const requestDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['requests', 'detail', id],
    queryFn: ({ signal }) => api.requests.getRequest({ id }, { signal }),
    staleTime: Infinity,
  });
