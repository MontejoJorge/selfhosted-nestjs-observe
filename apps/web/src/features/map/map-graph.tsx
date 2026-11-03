import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MapDto, MapEdgeDto, MapNodeDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration, formatRate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMemo, type CSSProperties } from 'react';
import {
  layoutMap,
  MAP_SIZES,
  type PlacedEdge,
  type PlacedNode,
} from './map-layout';
import {
  edgeColors,
  edgeTitle,
  edgeWidth,
  healthOf,
  measureNodeText,
  NODE_ICONS,
  NODE_KIND_LABELS,
  nodeCaption,
  nodeTone,
  showsErrorBadge,
} from './map-style';
import { useElementWidth } from './use-element-width';

const isHanging = (node: MapNodeDto) =>
  node.kind === 'database' || node.kind === 'external';

/** The map drawn left to right: links as SVG paths under the nodes as HTML. */
export function MapGraph({ map }: { map: MapDto }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const layout = useMemo(
    () =>
      layoutMap(map.nodes, map.edges, {
        width,
        measure: (node) => measureNodeText(node, isHanging(node)),
      }),
    [map, width],
  );
  const labels = useMemo(
    () => new Map(map.nodes.map((n) => [n.id, n.label])),
    [map.nodes],
  );
  const busiest = useMemo(
    () => Math.max(1, ...map.edges.map((e) => e.count)),
    [map.edges],
  );

  return (
    <div ref={ref} className="overflow-x-auto">
      <div
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height }}
      >
        {layout.columns.map((x, i) => (
          <div
            key={x}
            aria-hidden
            className="absolute inset-y-2.5 border-l border-dashed border-map-guide"
            style={{ left: x }}
          >
            <span className="absolute top-0 left-2 font-mono text-[10px] tracking-[1.2px] text-map-guide-label">
              {String(i + 1).padStart(2, '0')}
            </span>
          </div>
        ))}
        <svg
          className="absolute inset-0 overflow-visible"
          width={layout.width}
          height={layout.height}
        >
          {layout.edges.map((placed) => (
            <MapEdge
              key={`${placed.edge.source}>${placed.edge.target}`}
              placed={placed}
              width={edgeWidth(placed.edge.count, busiest)}
              title={edgeTitle(
                placed.edge,
                labels.get(placed.edge.source) ?? placed.edge.source,
                labels.get(placed.edge.target) ?? placed.edge.target,
              )}
            />
          ))}
        </svg>
        {layout.nodes.map((placed) =>
          placed.attached ? (
            <HangingNode key={placed.node.id} placed={placed} />
          ) : (
            <ColumnNode key={placed.node.id} placed={placed} />
          ),
        )}
      </div>
    </div>
  );
}

/** Length of each tail segment, in hundredths of the path. */
const TAIL_SEGMENT = 2;
/** Opacity of the tail's segments from the head back: it fades to nothing. */
const TAIL_OPACITY = [0.5, 0.36, 0.24, 0.14, 0.06];

function MapEdge({
  placed: { edge, path, route },
  title,
  width,
}: {
  placed: PlacedEdge<MapEdgeDto>;
  title: string;
  width: number;
}) {
  const { track, comet } = edgeColors(edge);
  // Slower comets on long loops; the tail is a few short dashes riding the same path.
  const duration = route === 'back' ? '6s' : '3.2s';
  return (
    <g>
      <title>{title}</title>
      <path
        d={path}
        fill="none"
        stroke={track}
        strokeWidth={width}
        strokeDasharray={edge.inferred ? '1 6' : undefined}
        strokeLinecap="round"
      />
      {/* Wide invisible stroke so the title shows without pixel hunting. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} />
      {route === 'attachment' || edge.count === 0 ? null : (
        <g className="motion-reduce:hidden" aria-hidden>
          {TAIL_OPACITY.map((opacity, i) => {
            // Segment i sits i segments behind the head, so the tail fades out.
            const offset = TAIL_SEGMENT * (i + 1);
            return (
              <path
                key={i}
                d={path}
                pathLength={100}
                fill="none"
                stroke={comet}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeDasharray={`${TAIL_SEGMENT} ${100 - TAIL_SEGMENT}`}
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from={offset}
                  to={offset - 100}
                  dur={duration}
                  repeatCount="indefinite"
                />
              </path>
            );
          })}
          <circle r={1.2 + width / 2} className="fill-map-comet">
            <animateMotion
              dur={duration}
              repeatCount="indefinite"
              path={path}
            />
          </circle>
        </g>
      )}
    </g>
  );
}

/** The icon tile: shape and border by kind, color by health. */
function NodeTile({ placed }: { placed: PlacedNode<MapNodeDto> }) {
  const { node, size } = placed;
  const Icon = NODE_ICONS[node.kind];
  const health = healthOf(node);
  const outlined = node.kind === 'client' || node.kind === 'external';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${NODE_KIND_LABELS[node.kind]} ${node.label}`}
          className={cn(
            'relative flex shrink-0 items-center justify-center border outline-none focus-visible:ring-2 focus-visible:ring-ring',
            node.kind === 'queue' ? 'rounded-full' : 'rounded-[30%]',
            health === 'idle'
              ? 'border-map-idle bg-map-tile text-map-meta'
              : outlined
                ? 'border-dashed border-[color-mix(in_srgb,var(--tone)_45%,transparent)] bg-map-tile text-[color-mix(in_srgb,var(--tone)_55%,var(--map-icon-mix))]'
                : 'border-[color-mix(in_srgb,var(--tone)_45%,transparent)] bg-[color-mix(in_srgb,var(--tone)_10%,var(--map-tile))] text-[color-mix(in_srgb,var(--tone)_55%,var(--map-icon-mix))] shadow-[0_0_0_3px_color-mix(in_srgb,var(--tone)_5%,transparent),0_6px_18px_color-mix(in_srgb,var(--tone)_11%,transparent)]',
          )}
          style={
            {
              width: size,
              height: size,
              '--tone': nodeTone(node),
            } as CSSProperties
          }
        >
          <Icon
            style={{ width: size * 0.45, height: size * 0.45 }}
            aria-hidden
          />
          {health === 'failing' ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-px animate-map-ping rounded-[inherit] border border-[color-mix(in_srgb,var(--map-failing)_90%,transparent)] motion-reduce:hidden"
            />
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <NodeDetails node={node} />
      </TooltipContent>
    </Tooltip>
  );
}

function NodeDetails({ node }: { node: MapNodeDto }) {
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono text-[11px]">
      <dt className="opacity-70">{NODE_KIND_LABELS[node.kind]}</dt>
      <dd className="font-semibold">{node.label}</dd>
      <dt className="opacity-70">{node.unit}</dt>
      <dd>{formatCount(node.count)}</dd>
      {node.avgMs !== null ? (
        <>
          <dt className="opacity-70">average</dt>
          <dd>{formatDuration(node.avgMs)}</dd>
        </>
      ) : null}
      {node.errorRate !== null ? (
        <>
          <dt className="opacity-70">failed</dt>
          <dd>{formatRate(node.errorRate)}</dd>
        </>
      ) : null}
    </dl>
  );
}

function ErrorBadge({ node }: { node: MapNodeDto }) {
  return (
    <span
      className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--tone)_70%,transparent)] bg-[color-mix(in_srgb,var(--tone)_20%,transparent)] px-1.5 font-mono text-[10px] leading-[14px] text-foreground tabular-nums"
      style={{ '--tone': nodeTone(node) } as CSSProperties}
    >
      {formatRate(node.errorRate ?? 0)} failed
    </span>
  );
}

/** Label (with the error badge) over the mono caption, cut to the width the layout reserved. */
function NodeText({
  node,
  width,
  className,
}: {
  node: MapNodeDto;
  width: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-0.5', className)}
      style={{ width }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            'truncate leading-4',
            isHanging(node)
              ? 'text-xs font-medium'
              : 'text-[13px] font-semibold',
          )}
          title={node.label}
        >
          {node.label}
        </span>
        {showsErrorBadge(node) ? <ErrorBadge node={node} /> : null}
      </div>
      <span className="truncate font-mono text-[10.5px] leading-[14px] text-map-meta tabular-nums">
        {nodeCaption(node)}
      </span>
    </div>
  );
}

/** A client, application or queue: label and caption over its icon. */
function ColumnNode({ placed }: { placed: PlacedNode<MapNodeDto> }) {
  const { node, x, y, size, textWidth } = placed;
  return (
    <div
      className="absolute flex flex-col items-start"
      style={{ left: x - size / 2, top: y - size / 2 - MAP_SIZES.text }}
    >
      <div
        className="flex flex-col justify-end pb-1.5"
        style={{ height: MAP_SIZES.text }}
      >
        <NodeText node={node} width={textWidth} />
      </div>
      <NodeTile placed={placed} />
    </div>
  );
}

/** A database or external service below its application: icon, then text. */
function HangingNode({ placed }: { placed: PlacedNode<MapNodeDto> }) {
  const { node, x, y, size, textWidth } = placed;
  return (
    <div
      className="absolute flex items-center"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        height: size,
        gap: MAP_SIZES.textGap,
      }}
    >
      <NodeTile placed={placed} />
      <NodeText node={node} width={textWidth} />
    </div>
  );
}
