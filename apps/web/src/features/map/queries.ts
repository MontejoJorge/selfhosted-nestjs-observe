import { api } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

/** Clients, applications, queues, databases and external services, and the links between them. */
export const mapQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['map', scope],
    queryFn: ({ signal }) => api.map.getMap(scope, { signal }),
  });
