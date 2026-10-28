import { useScope } from '@/lib/scope-hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { applicationsQueryOptions } from './queries';

/** id → name for the current project's applications (empty until loaded). */
export function useApplicationNames(): ReadonlyMap<string, string> {
  const { project, range } = useScope();
  const { data } = useQuery(applicationsQueryOptions(project, range));
  return useMemo(
    () => new Map((data?.items ?? []).map((app) => [app.id, app.name])),
    [data],
  );
}
