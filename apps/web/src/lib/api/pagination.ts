import type { Page } from '@selfhosted-observe/contracts';
import { infiniteQueryOptions, type QueryKey } from '@tanstack/react-query';
import { apiGet, type QueryParams } from './client';

export const PAGE_SIZE = 50;

/** queryOptions for a cursor-paginated list endpoint returning `Page<T>`. */
export function pagedQueryOptions<T>(
  queryKey: QueryKey,
  path: string,
  params: QueryParams,
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<T>>(
        path,
        { ...params, limit: PAGE_SIZE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
