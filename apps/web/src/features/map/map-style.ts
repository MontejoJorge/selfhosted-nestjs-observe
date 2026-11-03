import type {
  MapEdgeDto,
  MapNodeDto,
  MapNodeKind,
} from '@/lib/api/generated/api';
import { formatCount, formatDuration, formatRate } from '@/lib/format';
import {
  BoxIcon,
  DatabaseIcon,
  GlobeIcon,
  LayersIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

/** Above this error rate a node or link is drawn as elevated. */
export const ELEVATED_ERRORS = 0.01;
/** At or above this error rate it is drawn as failing. */
export const FAILING_ERRORS = 0.05;

export type Health = 'idle' | 'ok' | 'elevated' | 'failing';

export function healthOf({
  count,
  errorRate,
}: Pick<MapNodeDto | MapEdgeDto, 'count' | 'errorRate'>): Health {
  if (count === 0) return 'idle';
  if (errorRate !== null && errorRate >= FAILING_ERRORS) return 'failing';
  if (errorRate !== null && errorRate > ELEVATED_ERRORS) return 'elevated';
  return 'ok';
}

/** The CSS color of a node: its health, else teal for applications, neutral otherwise. */
export function nodeTone(node: MapNodeDto): string {
  const health = healthOf(node);
  if (health === 'failing') return 'var(--map-failing)';
  if (health === 'elevated') return 'var(--map-elevated)';
  return node.kind === 'application'
    ? 'var(--map-healthy)'
    : 'var(--map-neutral)';
}

/** Track (line) and comet colors of a link. */
export function edgeColors(edge: MapEdgeDto): { track: string; comet: string } {
  switch (healthOf(edge)) {
    case 'failing':
      return {
        track: 'color-mix(in srgb, var(--map-failing) 60%, transparent)',
        comet: 'var(--map-failing)',
      };
    case 'elevated':
      return {
        track: 'color-mix(in srgb, var(--map-elevated) 40%, transparent)',
        comet: 'var(--map-elevated)',
      };
    default:
      return { track: 'var(--map-track)', comet: 'var(--map-healthy)' };
  }
}

/** Busier links are drawn thicker: 1.5 to 2.5 px on a log scale. */
export function edgeWidth(count: number, max: number): number {
  if (max <= 1 || count <= 0) return 1.5;
  return 1.5 + Math.log1p(count) / Math.log1p(max);
}

export const NODE_ICONS: Record<MapNodeKind, LucideIcon> = {
  client: UsersIcon,
  application: BoxIcon,
  queue: LayersIcon,
  database: DatabaseIcon,
  external: GlobeIcon,
};

export const NODE_KIND_LABELS: Record<MapNodeKind, string> = {
  client: 'Inbound traffic',
  application: 'App',
  queue: 'Queue',
  database: 'Database',
  external: 'Third-party API',
};

/** "11.9K requests · 172 ms" */
export function nodeCaption({
  count,
  unit,
  avgMs,
}: Pick<MapNodeDto, 'count' | 'unit' | 'avgMs'>): string {
  const volume = `${formatCount(count)} ${count === 1 ? unit.replace(/s$/, '') : unit}`;
  return avgMs === null ? volume : `${volume} · ${formatDuration(avgMs)}`;
}

/** Applications above 1% errors carry a badge with their rate. */
export const showsErrorBadge = (node: MapNodeDto) =>
  node.kind === 'application' &&
  (healthOf(node) === 'elevated' || healthOf(node) === 'failing');

/**
 * Approximate width (px) of a node's label and caption, for the layout to keep
 * them clear of links. Generous on purpose; the component cuts anything longer.
 */
export function measureNodeText(node: MapNodeDto, hanging: boolean): number {
  const label =
    node.label.length * (hanging ? 7 : 7.6) +
    (showsErrorBadge(node)
      ? 8 + `${formatRate(node.errorRate ?? 0)} failed`.length * 6.2 + 14
      : 0);
  const caption = nodeCaption(node).length * 6.4;
  return Math.ceil(Math.max(label, caption) + 10);
}

/** "inventory-api → emails · 1,204 · 0.4% failed", for an edge's hover title. */
export function edgeTitle(
  edge: MapEdgeDto,
  source: string,
  target: string,
): string {
  const parts = [`${source} → ${target}`, formatCount(edge.count)];
  if (edge.errorRate !== null)
    parts.push(`${formatRate(edge.errorRate)} failed`);
  if (edge.inferred) parts.push('inferred');
  return parts.join(' · ');
}
