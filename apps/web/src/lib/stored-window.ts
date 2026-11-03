import { useEffect } from 'react';
import {
  DEFAULT_RANGE,
  SCOPE_KEYS,
  windowFromParams,
  type TimeWindow,
} from './api/scope';
import { useTimeWindow } from './scope-hooks';

const STORAGE_KEY = 'observe-time-window';

const WINDOW_KEYS = [
  'range',
  'from',
  'to',
] as const satisfies readonly (typeof SCOPE_KEYS)[number][];

/** The window as search params: a preset's `range`, or a custom `from` (and `to`). */
export function windowSearch(window: TimeWindow): URLSearchParams {
  const search = new URLSearchParams();
  if (window.from === undefined) search.set('range', window.range);
  else {
    search.set('from', window.from);
    if (window.to !== undefined) search.set('to', window.to);
  }
  return search;
}

/**
 * `params` plus the stored window, when the URL picks no window of its own and the
 * stored one is valid and not the default. Null when there is nothing to restore.
 */
export function withStoredWindow(
  params: URLSearchParams,
  stored: string | null,
): URLSearchParams | null {
  if (stored === null || WINDOW_KEYS.some((key) => params.has(key)))
    return null;
  const window = windowFromParams(new URLSearchParams(stored));
  if (window.from === undefined && window.range === DEFAULT_RANGE) return null;
  const restored = new URLSearchParams(params);
  for (const [key, value] of windowSearch(window)) restored.set(key, value);
  return restored;
}

export function readStoredWindow(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the URL's time window, so the next visit without one starts there. */
export function useStoreTimeWindow(): void {
  const window = useTimeWindow();
  const search = windowSearch(window).toString();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, search);
    } catch {
      // Storage unavailable (private mode, blocked): nothing is remembered.
    }
  }, [search]);
}
