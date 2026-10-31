import type { TimeRange } from '@/lib/api/generated/api';
import { DEFAULT_RANGE_PRESETS } from '@/lib/api/scope';
import { useOptionalProjectRef } from '@/lib/scope-hooks';
import { useQuery } from '@tanstack/react-query';
import { projectQueryOptions } from './queries';

/**
 * The current project's quick ranges for the page header (Settings), or the
 * default three outside a project and while the project loads.
 */
export function useRangePresets(): readonly TimeRange[] {
  const project = useOptionalProjectRef();
  const { data } = useQuery({
    ...projectQueryOptions(project ?? ''),
    enabled: project !== undefined,
  });
  return data?.rangePresets ?? DEFAULT_RANGE_PRESETS;
}
