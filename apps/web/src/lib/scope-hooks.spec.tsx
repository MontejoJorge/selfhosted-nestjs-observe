// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  useOptionalProjectRef,
  useScope,
  useScopedHref,
  useSetTimeWindow,
  useTypedSearch,
} from './scope-hooks';
import { optionalEnum, optionalString } from './search';

afterEach(cleanup);

/** Renders `hook` on a memory router at `url`, under /projects/:projectId. */
function renderAt<T>(url: string, hook: () => T) {
  function Wrapper({ children }: { children: ReactNode }) {
    // One router per render tree, so navigations survive re-renders.
    const [router] = useState(() =>
      createMemoryRouter(
        [
          { path: '/projects/:projectId/*', element: children },
          { path: '*', element: children },
        ],
        { initialEntries: [url] },
      ),
    );
    return <RouterProvider router={router} />;
  }
  return renderHook(() => ({ value: hook(), location: useLocation() }), {
    wrapper: Wrapper,
  });
}

describe('useScope', () => {
  it('combines the project from the path with the search params', () => {
    const { result } = renderAt(
      '/projects/shop/requests?application=app-1&range=24h&q=x',
      useScope,
    );
    expect(result.current.value).toEqual({
      project: 'shop',
      application: 'app-1',
      range: '24h',
    });
  });

  it('keeps the same object when unrelated params change', () => {
    const { result } = renderAt('/projects/shop/requests?range=7d', () => ({
      scope: useScope(),
      search: useTypedSearch(filters),
    }));
    const before = result.current.value.scope;
    act(() => result.current.value.search[1]({ status: 'error' }));
    expect(result.current.location.search).toBe('?range=7d&status=error');
    expect(result.current.value.scope).toBe(before);
  });
});

describe('useOptionalProjectRef', () => {
  it('is undefined outside a project', () => {
    const { result } = renderAt('/storage', useOptionalProjectRef);
    expect(result.current.value).toBeUndefined();
  });
});

const filters = z.object({
  q: optionalString,
  status: optionalEnum(['ok', 'error']),
});

describe('useTypedSearch', () => {
  it('parses the params and patches them, keeping the others', () => {
    const { result } = renderAt(
      '/projects/shop/requests?range=24h&status=bogus&q=a',
      () => useTypedSearch(filters),
    );
    expect(result.current.value[0]).toEqual({ q: 'a', status: undefined });

    act(() => result.current.value[1]({ status: 'ok', q: undefined }));
    expect(result.current.location.search).toBe('?range=24h&status=ok');
    expect(result.current.value[0]).toEqual({ q: undefined, status: 'ok' });
  });
});

describe('useSetTimeWindow', () => {
  it('switches between a preset and a custom window', () => {
    const { result } = renderAt('/projects/shop?application=a&range=7d', () =>
      useSetTimeWindow(),
    );
    act(() =>
      result.current.value.custom(
        '2026-10-29T00:00:00Z',
        '2026-10-29T06:00:00Z',
      ),
    );
    expect(
      Object.fromEntries(new URLSearchParams(result.current.location.search)),
    ).toEqual({
      application: 'a',
      from: '2026-10-29T00:00:00Z',
      to: '2026-10-29T06:00:00Z',
    });

    act(() => result.current.value.preset('24h'));
    expect(result.current.location.search).toBe('?application=a&range=24h');
  });
});

describe('useScopedHref', () => {
  it('keeps the application and window but not page filters', () => {
    const { result } = renderAt(
      '/projects/shop/requests?application=a&from=2026-10-29T00:00:00Z&q=x',
      useScopedHref,
    );
    const href = result.current.value;
    expect(href('/projects/shop/logs')).toBe(
      '/projects/shop/logs?application=a&from=2026-10-29T00%3A00%3A00Z',
    );
    expect(
      href('/projects/shop/logs', { level: 'error', application: undefined }),
    ).toBe('/projects/shop/logs?from=2026-10-29T00%3A00%3A00Z&level=error');
  });

  it('returns the bare path without scope params', () => {
    const { result } = renderAt('/projects/shop?q=x', useScopedHref);
    expect(result.current.value('/projects/shop/errors')).toBe(
      '/projects/shop/errors',
    );
  });
});
