import { apiGet } from '@/lib/api/client';
import type { ServiceSummary } from '@selfhosted-observe/contracts';
import { queryOptions } from '@tanstack/react-query';

export const servicesQueryOptions = () =>
  queryOptions({
    queryKey: ['services'],
    queryFn: ({ signal }) =>
      apiGet<ServiceSummary[]>('/services', undefined, signal),
    staleTime: 60_000,
  });
