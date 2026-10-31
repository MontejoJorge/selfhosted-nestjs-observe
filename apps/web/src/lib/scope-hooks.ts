import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import type { TimeRange } from './api/generated/api';
import {
  SCOPE_KEYS,
  scopeFromParams,
  windowFromParams,
  type Scope,
  type TimeWindow,
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

/** The `:projectId` route param, or undefined outside /projects/:projectId. */
export function useOptionalProjectRef(): string | undefined {
  return useParams().projectId;
}

/** The raw scope params of the URL, joined: a stable dependency for memos. */
function useScopeParamsKey(): string {
  const [params] = useSearchParams();
  return JSON.stringify(SCOPE_KEYS.map((key) => params.get(key) ?? ''));
}

function paramsOfKey(key: string): URLSearchParams {
  const values = JSON.parse(key) as string[];
  return new URLSearchParams(
    SCOPE_KEYS.map((name, i) => [name, values[i] ?? '']),
  );
}

/** The project from the path plus application + time window from the URL. */
export function useScope(): Scope {
  const project = useProjectRef();
  const key = useScopeParamsKey();
  // Depend on the raw strings so unrelated param changes keep the same object.
  return useMemo(
    () => scopeFromParams(project, paramsOfKey(key)),
    [project, key],
  );
}

/** The time window alone (`range`, or a custom `from`/`to`), also outside a project. */
export function useTimeWindow(): TimeWindow {
  const key = useScopeParamsKey();
  return useMemo(() => windowFromParams(paramsOfKey(key)), [key]);
}

/** Switches the URL between a preset and a custom window (one excludes the other). */
export function useSetTimeWindow() {
  const [, setParams] = useSearchParams();
  return useMemo(
    () => ({
      preset: (range: TimeRange) =>
        setParams((prev) =>
          applySearchPatch(prev, { range, from: undefined, to: undefined }),
        ),
      custom: (from: string, to: string) =>
        setParams((prev) =>
          applySearchPatch(prev, { range: undefined, from, to }),
        ),
      clearCustom: () =>
        setParams((prev) =>
          applySearchPatch(prev, { from: undefined, to: undefined }),
        ),
    }),
    [setParams],
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

/** Builds `path?…` keeping the current application and time window, plus `search`. */
export function useScopedHref() {
  const key = useScopeParamsKey();
  return useCallback(
    (path: string, search?: SearchPatch) => {
      const next = new URLSearchParams();
      for (const [name, value] of paramsOfKey(key)) {
        if (value) next.set(name, value);
      }
      const merged = applySearchPatch(next, search ?? {});
      const query = merged.toString();
      return query ? `${path}?${query}` : path;
    },
    [key],
  );
}

/** `navigate()` that keeps the current application and time window. */
export function useScopedNavigate() {
  const navigate = useNavigate();
  const href = useScopedHref();
  return useCallback(
    (path: string, search?: SearchPatch) => navigate(href(path, search)),
    [navigate, href],
  );
}
