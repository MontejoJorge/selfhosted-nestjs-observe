import type { TimeBucketDto } from '@/lib/api/generated/api';

/** A point in time drawn as a vertical line over a bucket chart (a deploy). */
export interface ChartMarker {
  at: string;
  /** Short text above the line, e.g. the version. */
  label: string;
  /** Hover text. */
  detail: string;
}

/** At most this many labels per chart; other markers keep their line only. */
const MAX_LABELS = 4;
/** Labels closer than this share of the chart width are dropped (older first). */
const MIN_LABEL_GAP = 0.14;
/** Room above the plot for the labels. */
export const MARKER_MARGIN_TOP = 16;

export interface PlacedMarker {
  t: string;
  label: string | null;
  detail: string;
  anchor: 'start' | 'end';
}

/** Puts each marker on the bucket it falls in, merging those that share one. */
export function placeMarkers(
  buckets: readonly TimeBucketDto[],
  markers: readonly ChartMarker[],
): PlacedMarker[] {
  if (buckets.length === 0 || markers.length === 0) return [];
  const starts = buckets.map((b) => new Date(b.t).getTime());
  const width = starts.length > 1 ? starts[1] - starts[0] : 0;
  const end = starts[starts.length - 1] + width;
  const groups = new Map<number, ChartMarker[]>();
  for (const marker of markers) {
    const at = new Date(marker.at).getTime();
    if (at < starts[0] || at > end) continue;
    let index = starts.length - 1;
    while (index > 0 && starts[index] > at) index -= 1;
    groups.set(index, [...(groups.get(index) ?? []), marker]);
  }

  const indexes = [...groups.keys()].toSorted((a, b) => b - a);
  const minGap = Math.max(1, buckets.length * MIN_LABEL_GAP);
  let labeled = 0;
  let lastLabeled = Infinity;
  return indexes.map((index) => {
    const group = groups.get(index) ?? [];
    const newest = group[group.length - 1];
    const showLabel = labeled < MAX_LABELS && lastLabeled - index >= minGap;
    if (showLabel) {
      labeled += 1;
      lastLabeled = index;
    }
    return {
      t: buckets[index].t,
      label: showLabel
        ? `${newest.label}${group.length > 1 ? ` +${group.length - 1}` : ''}`
        : null,
      detail: group.map((marker) => marker.detail).join('\n'),
      anchor: index > buckets.length * 0.7 ? 'end' : 'start',
    };
  });
}
