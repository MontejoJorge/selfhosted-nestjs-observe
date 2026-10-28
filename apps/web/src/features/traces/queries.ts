import { api } from '@/lib/api/client';
import { queryOptions } from '@tanstack/react-query';

export const traceQueryOptions = (project: string, traceId: string) =>
  queryOptions({
    queryKey: ['traces', project, traceId],
    queryFn: ({ signal }) =>
      api.traces.getTrace({ traceId, project }, { signal }),
  });
