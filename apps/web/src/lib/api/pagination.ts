import { infiniteQueryOptions, type QueryKey } from '@tanstack/react-query';

export const PAGE_SIZE = 50;

interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** infiniteQueryOptions for a cursor-paginated endpoint (`{ items, nextCursor }`). */
export function pagedQueryOptions<T>(
  queryKey: QueryKey,
  fetchPage: (
    page: { limit: number; cursor: string | undefined },
    signal: AbortSignal,
  ) => Promise<CursorPage<T>>,
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchPage({ limit: PAGE_SIZE, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
