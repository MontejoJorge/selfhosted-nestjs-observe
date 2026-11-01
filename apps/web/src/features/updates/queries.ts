import { api } from '@/lib/api/client';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** The API refreshes the latest release every 12 hours; reading it hourly is plenty. */
const UPDATE_STATUS_STALE_MS = 60 * 60 * 1000;

/** Running version, latest GitHub release and whether the check is on. */
export const updateStatusQueryOptions = () =>
  queryOptions({
    queryKey: ['updates', 'status'],
    queryFn: ({ signal }) => api.updates.getUpdateStatus({ signal }),
    staleTime: UPDATE_STATUS_STALE_MS,
  });

export const updateSettingsMutation = () =>
  mutationOptions({
    mutationFn: (enabled: boolean) =>
      api.updates.updateUpdateSettings({ enabled }),
  });

export const checkForUpdatesMutation = () =>
  mutationOptions({
    mutationFn: () => api.updates.checkForUpdates(),
  });
