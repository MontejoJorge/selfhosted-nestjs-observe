import { api } from '@/lib/api/client';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Whether the collector reports its own telemetry, and to which project. */
export const selfObserveQueryOptions = () =>
  queryOptions({
    queryKey: ['self-observe'],
    queryFn: ({ signal }) => api.selfObserve.getSelfObserve({ signal }),
  });

export const updateSelfObserveMutation = () =>
  mutationOptions({
    mutationFn: (enabled: boolean) =>
      api.selfObserve.updateSelfObserve({ enabled }),
  });
