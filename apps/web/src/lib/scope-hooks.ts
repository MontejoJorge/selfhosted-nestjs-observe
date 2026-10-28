import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import type { TimeRange } from './api/generated/api';
import {
  rangeFromParams,
  SCOPE_KEYS,
  scopeFromParams,
  type Scope,
} from './api/scope';
import {
  applySearchPatch,
  parseSearch,
  type SearchPatch,
  type SearchSchema,
} from './search';

/** The `:projectId` route param (a slug or id). Only use it under /projects/:projectId. */
export function useProjectRef(): string {
  const { projectId } = useParams();
  if (!projectId)
    throw new Error('useProjectRef must be used under /projects/:projectId');
  return projectId;
}

/** The project from the path plus application + time range from the URL. */
export function useScope(): Scope {
  const project = useProjectRef();
  const [params] = useSearchParams();
  const application = params.get('application');
  const range = params.get('range');
  // Depend on the raw strings so unrelated param changes keep the same object.
  return useMemo(
    () =>
      scopeFromParams(
        project,
        new URLSearchParams({
          application: application ?? '',
          range: range ?? '',
        }),
      ),
    [project, application, range],
  );
}

/** The time range alone, for pages outside a project. */
export function useRange(): TimeRange {
  const [params] = useSearchParams();
  const range = params.get('range');
  return useMemo(
    () => rangeFromParams(new URLSearchParams({ range: range ?? '' })),
    [range],
  );
}

/** Page search params parsed with a zod schema, plus a setter that patches them. */
export function useTypedSearch<S extends SearchSchema>(schema: S) {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures `params`
  const search = useMemo(() => parseSearch(schema, params), [schema, key]);
  const setSearch = useCallback(
    (patch: Partial<Record<keyof z.output<S>, string | number | undefined>>) =>
      setParams((prev) => applySearchPatch(prev, patch as SearchPatch)),
    [setParams],
  );
  return [search, setSearch] as const;
}

/** Builds `path?…` keeping the current application and range, plus `search`. */
export function useScopedHref() {
  const [params] = useSearchParams();
  const application = params.get('application');
  const range = params.get('range');
  return useCallback(
    (path: string, search?: SearchPatch) => {
      const next = new URLSearchParams();
      const scope = { application, range };
      for (const key of SCOPE_KEYS) {
        const value = scope[key];
        if (value) next.set(key, value);
      }
      const merged = applySearchPatch(next, search ?? {});
      const query = merged.toString();
      return query ? `${path}?${query}` : path;
    },
    [application, range],
  );
}

/** `navigate()` that keeps the current application and range. */
export function useScopedNavigate() {
  const navigate = useNavigate();
  const href = useScopedHref();
  return useCallback(
    (path: string, search?: SearchPatch) => navigate(href(path, search)),
    [navigate, href],
  );
}
