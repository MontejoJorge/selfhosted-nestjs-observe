import { api } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

/** Own and total time per class (and its methods), shared by Services and the dashboard. */
export const servicesQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['services', scope],
    queryFn: ({ signal }) => api.services.listServices(scope, { signal }),
  });
