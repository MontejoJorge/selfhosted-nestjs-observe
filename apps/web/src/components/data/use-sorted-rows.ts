import { useMemo, useState } from 'react';

export interface SortState<K extends string> {
  key: K;
  direction: 'asc' | 'desc';
}

export type SortAccessors<T, K extends string> = Record<
  K,
  (row: T) => number | string
>;

/**
 * Client-side sorting for small aggregated tables.
 * Pass `accessors` as a module-level constant so it stays referentially stable.
 */
export function useSortedRows<T, K extends string>(
  rows: readonly T[],
  accessors: SortAccessors<T, K>,
  initial: SortState<NoInfer<K>>,
) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const read = accessors[sort.key];
    const factor = sort.direction === 'asc' ? 1 : -1;
    return rows.toSorted((a, b) => {
      const av = read(a);
      const bv = read(b);
      if (av < bv) return -factor;
      if (av > bv) return factor;
      return 0;
    });
  }, [rows, accessors, sort]);

  const toggle = (key: K) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    );

  return { sorted, sort, toggle };
}
