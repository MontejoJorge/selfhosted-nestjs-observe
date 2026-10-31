import type { TimeBucketDto } from '@/lib/api/generated/api';
import { ReferenceLine } from 'recharts';
import {
  MARKER_MARGIN_TOP,
  placeMarkers,
  type ChartMarker,
  type PlacedMarker,
} from './marker-placement';

interface LineShapeProps {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

function MarkerShape({
  marker,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 0,
}: LineShapeProps & { marker: PlacedMarker }) {
  const top = Math.min(y1, y2);
  const dx = marker.anchor === 'end' ? -4 : 4;
  return (
    <g className="chart-marker">
      <title>{marker.detail}</title>
      <line
        x1={x1}
        x2={x2}
        y1={top - (marker.label ? MARKER_MARGIN_TOP - 4 : 0)}
        y2={Math.max(y1, y2)}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      {/* A wider invisible line so the hover text is easy to reach. */}
      <line
        x1={x1}
        x2={x2}
        y1={top}
        y2={Math.max(y1, y2)}
        stroke="transparent"
        strokeWidth={8}
        pointerEvents="stroke"
      />
      {marker.label ? (
        <text
          x={x1 + dx}
          y={top - 6}
          textAnchor={marker.anchor}
          fill="var(--muted-foreground)"
          fontSize={10}
          fontFamily="var(--font-mono)"
        >
          {marker.label}
        </text>
      ) : null}
    </g>
  );
}

/** Vertical deploy lines for a bucket chart (render it inside the Recharts chart). */
export function ChartMarkers({
  buckets,
  markers,
}: {
  buckets: readonly TimeBucketDto[];
  markers: readonly ChartMarker[] | undefined;
}) {
  if (!markers) return null;
  return placeMarkers(buckets, markers).map((marker) => (
    <ReferenceLine
      key={marker.t}
      x={marker.t}
      ifOverflow="visible"
      shape={(props: LineShapeProps) => (
        <MarkerShape {...props} marker={marker} />
      )}
    />
  ));
}
