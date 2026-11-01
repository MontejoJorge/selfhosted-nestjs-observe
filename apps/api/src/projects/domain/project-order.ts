/** True when `order` lists every id of `all` exactly once, and nothing else. */
export function isFullOrder(
  order: readonly string[],
  all: readonly string[],
): boolean {
  if (order.length !== all.length) return false;
  const remaining = new Set(all);
  for (const id of order) if (!remaining.delete(id)) return false;
  return remaining.size === 0;
}

/** Keyset cursors of the projects list carry the position as a decimal string. */
export const POSITION_KEY = /^\d{1,10}$/;
