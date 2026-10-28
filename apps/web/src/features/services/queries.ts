import { api } from '@/lib/api/client';
import { queryOptions } from '@tanstack/react-query';

export const servicesQueryOptions = () =>
  queryOptions({
    queryKey: ['services'],
    queryFn: ({ signal }) => api.services.listServices({ signal }),
    staleTime: 60_000,
  });
