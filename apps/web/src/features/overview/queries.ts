import { apiGet } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import type { Overview } from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export const overviewQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['overview', scope],
    queryFn: ({ signal }) =>
      apiGet<Overview>('/overview', { ...scope }, signal),
  });
