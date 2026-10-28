import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { SCOPE_KEYS, scopeFromParams, type Scope } from './api/scope';
import {
  applySearchPatch,
  parseSearch,
  type SearchPatch,
  type SearchSchema,
} from './search';

/** The global service + time range from the URL. */
export function useScope(): Scope {
  const [params] = useSearchParams();
  const service = params.get('service');
  const range = params.get('range');
  // Depend on the two raw strings so unrelated param changes keep the same object.
  return useMemo(
    () =>
      scopeFromParams(
        new URLSearchParams({ service: service ?? '', range: range ?? '' }),
      ),
    [service, range],
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

/** Builds `path?…` keeping the current service and range, plus `search`. */
export function useScopedHref() {
  const [params] = useSearchParams();
  const service = params.get('service');
  const range = params.get('range');
  return useCallback(
    (path: string, search?: SearchPatch) => {
      const next = new URLSearchParams();
      const scope = { service, range };
      for (const key of SCOPE_KEYS) {
        const value = scope[key];
        if (value) next.set(key, value);
      }
      const merged = applySearchPatch(next, search ?? {});
      const query = merged.toString();
      return query ? `${path}?${query}` : path;
    },
    [service, range],
  );
}

/** `navigate()` that keeps the current service and range. */
export function useScopedNavigate() {
  const navigate = useNavigate();
  const href = useScopedHref();
  return useCallback(
    (path: string, search?: SearchPatch) => navigate(href(path, search)),
    [navigate, href],
  );
}
