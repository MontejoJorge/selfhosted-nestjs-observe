import { api } from '@/lib/api/client';
import { queryOptions } from '@tanstack/react-query';

export const traceQueryOptions = (traceId: string) =>
  queryOptions({
    queryKey: ['traces', traceId],
    queryFn: ({ signal }) => api.traces.getTrace({ traceId }, { signal }),
  });
