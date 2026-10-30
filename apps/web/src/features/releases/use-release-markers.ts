import type { ChartMarker } from '@/components/charts/marker-placement';
import { useApplicationNames } from '@/features/applications/use-application-names';
import type { Scope } from '@/lib/api/scope';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { releaseMarkersQueryOptions } from './queries';
import { shortVersion } from './release-math';

/**
 * Release boundaries of the scope as chart markers. Never suspends: the charts
 * render first and the lines appear when the markers arrive.
 */
export function useReleaseMarkers(scope: Scope): readonly ChartMarker[] {
  const { data } = useQuery(releaseMarkersQueryOptions(scope));
  const names = useApplicationNames();
  const showApplication = scope.application === undefined;
  return useMemo(
    () =>
      (data ?? []).map((marker) => {
        const app = showApplication ? names.get(marker.applicationId) : null;
        return {
          at: marker.at,
          label: shortVersion(marker.version),
          detail: `${app ? `${app} ` : ''}${marker.version} first seen ${formatDateTime(marker.at)}`,
        };
      }),
    [data, names, showApplication],
  );
}
