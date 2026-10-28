import { api } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

export const overviewQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['overview', scope],
    queryFn: ({ signal }) => api.overview.getOverview(scope, { signal }),
  });
