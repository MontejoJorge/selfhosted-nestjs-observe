import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, pagedQueryOptions } from './pagination';

describe('pagedQueryOptions', () => {
  it('fetches pages by cursor until nextCursor is null', async () => {
    const calls: Array<{ limit: number; cursor: string | undefined }> = [];
    const pages: Record<
      string,
      { items: number[]; nextCursor: string | null }
    > = {
      first: { items: [1, 2], nextCursor: 'c2' },
      c2: { items: [3], nextCursor: null },
    };
    const options = pagedQueryOptions(
      ['things', 'list'],
      async (page, signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        calls.push(page);
        return pages[page.cursor ?? 'first'];
      },
    );

    const client = new QueryClient();
    const observer = await client.fetchInfiniteQuery({ ...options, pages: 2 });

    expect(calls).toEqual([
      { limit: PAGE_SIZE, cursor: undefined },
      { limit: PAGE_SIZE, cursor: 'c2' },
    ]);
    expect(observer.pages.flatMap((p) => p.items)).toEqual([1, 2, 3]);
    expect(
      options.getNextPageParam(pages.c2, [], undefined, []),
    ).toBeUndefined();
    expect(options.getNextPageParam(pages.first, [], undefined, [])).toBe('c2');
  });

  it('keeps the given query key', () => {
    const options = pagedQueryOptions(
      ['requests', { project: 'p' }],
      async () => ({
        items: [],
        nextCursor: null,
      }),
    );
    expect(options.queryKey).toEqual(['requests', { project: 'p' }]);
    expect(options.initialPageParam).toBeUndefined();
  });
});
