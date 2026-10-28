import { apiGet } from '@/lib/api/client';
import type { TraceDetail } from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export const traceQueryOptions = (traceId: string) =>
  queryOptions({
    queryKey: ['traces', traceId],
    queryFn: ({ signal }) =>
      apiGet<TraceDetail>(
        `/traces/${encodeURIComponent(traceId)}`,
        undefined,
        signal,
      ),
  });
