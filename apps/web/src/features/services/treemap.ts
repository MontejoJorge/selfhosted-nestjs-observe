export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Worst aspect ratio of a strip of `areas` laid along a side of length `side`. */
function worst(areas: readonly number[], side: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max(
    (side * side * max) / (sum * sum),
    (sum * sum) / (side * side * min),
  );
}

/** Lays one strip along the shorter side of `rect` and returns what is left of it. */
function layStrip(areas: readonly number[], rect: Rect, out: Rect[]): Rect {
  const sum = areas.reduce((total, area) => total + area, 0);
  if (rect.w >= rect.h) {
    const width = sum / rect.h;
    let y = rect.y;
    for (const area of areas) {
      const h = area / width;
      out.push({ x: rect.x, y, w: width, h });
      y += h;
    }
    return { x: rect.x + width, y: rect.y, w: rect.w - width, h: rect.h };
  }
  const height = sum / rect.w;
  let x = rect.x;
  for (const area of areas) {
    const w = area / height;
    out.push({ x, y: rect.y, w, h: height });
    x += w;
  }
  return { x: rect.x, y: rect.y + height, w: rect.w, h: rect.h - height };
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk): one rectangle per value, in the same
 * order, with areas proportional to the values. Pass the values sorted largest first.
 */
export function squarify(values: readonly number[], bounds: Rect): Rect[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => ({ ...bounds, w: 0, h: 0 }));
  const scale = (bounds.w * bounds.h) / total;
  const areas = values.map((value) => Math.max(value * scale, 1e-9));

  const out: Rect[] = [];
  let rect = bounds;
  let strip: number[] = [];
  for (const area of areas) {
    const side = Math.min(rect.w, rect.h);
    if (
      strip.length === 0 ||
      worst([...strip, area], side) <= worst(strip, side)
    ) {
      strip.push(area);
    } else {
      rect = layStrip(strip, rect, out);
      strip = [area];
    }
  }
  if (strip.length > 0) layStrip(strip, rect, out);
  return out;
}

/**
 * Squarified layout of the longest prefix of `values` (at most `max`) whose tiles are all
 * at least `minSide` wide and tall once `gap` is taken off each: the values that would
 * get a sliver are left out, for the caller to group. Always lays out at least one.
 */
export function fitTreemap(
  values: readonly number[],
  bounds: Rect,
  { max, minSide, gap }: { max: number; minSide: number; gap: number },
): Rect[] {
  for (let count = Math.min(max, values.length); count > 1; count--) {
    const rects = squarify(values.slice(0, count), bounds);
    if (rects.every((r) => r.w - gap >= minSide && r.h - gap >= minSide))
      return rects;
  }
  return values.length > 0 ? [bounds] : [];
}
