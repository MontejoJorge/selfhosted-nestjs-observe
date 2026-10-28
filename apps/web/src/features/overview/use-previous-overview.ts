import type { OverviewDto } from '@/lib/api/generated/api';
import type { Scope } from '@/lib/api/scope';
import { useQuery } from '@tanstack/react-query';
import { previousOverviewQueryOptions, type OverviewFilters } from './queries';

/** The overview of the previous period, once loaded (trends are optional). */
export function usePreviousOverview(
  scope: Scope,
  filters?: OverviewFilters,
): OverviewDto | undefined {
  return useQuery(previousOverviewQueryOptions(scope, filters)).data;
}
