/** A copy of `items` with the item at `from` moved to `to`; out-of-range moves are no-ops. */
export function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const next = [...items];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  )
    return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
