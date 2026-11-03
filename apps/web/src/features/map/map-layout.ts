import type {
  MapEdgeDto,
  MapNodeDto,
  MapNodeKind,
} from '@/lib/api/generated/api';

/**
 * Lays the map out left to right without a graph library (a small Sugiyama):
 *
 * - Clients, applications and queues get a column from the longest path that
 *   reaches them; databases and external services hang below the application
 *   that calls them.
 * - A link that skips columns gets a reserved lane (a "dummy" slot) in every
 *   column it crosses, so it runs between nodes and never through one.
 * - Columns are ordered by barycenter sweeps in both directions plus adjacent
 *   swaps, keeping the order with the fewest crossings.
 * - Links only change rows in the free corridor between two columns (right of
 *   every label of the left column), and a link back to an earlier column runs
 *   along its own lane below every node.
 *
 * Coordinates are px; a node anchors on the center of its icon.
 */

type LayoutNode = Pick<MapNodeDto, 'id' | 'kind'>;
type LayoutEdge = Pick<MapEdgeDto, 'source' | 'target'>;

/** Icon box per kind: databases and external services hang smaller. */
export const ICON_SIZES: Record<MapNodeKind, number> = {
  client: 32,
  application: 36,
  queue: 32,
  database: 26,
  external: 26,
};

export const MAP_SIZES = {
  /** Label and caption above a column node's icon. */
  text: 36,
  /** Height of a hanging node's text, centered on its icon. */
  hangingText: 32,
  /** Vertical step between the nodes hanging below an application. */
  attachment: 40,
  /** From an application's icon to the top of its first hanging node. */
  hangingTop: 12,
  /** How far right of their application the hanging nodes sit. */
  indent: 30,
  /** Between a hanging node's icon and its text. */
  textGap: 8,
  /** Gap between two node slots of a column. */
  gap: 40,
  /** Gap around a lane reserved for a link crossing a column. */
  laneGap: 16,
  /** Narrowest free corridor between two columns, where links change rows. */
  corridor: 72,
  /** Distance between two parallel loops (lanes and vertical runs). */
  loopStep: 10,
  /** Widest text block; longer labels are cut by the component. */
  maxText: 220,
  /** Text width assumed when no `measure` is given. */
  defaultText: 150,
  /** Distance between two links entering or leaving the same side of an icon. */
  port: 6,
  padX: 32,
  padY: 32,
} as const;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type EdgeRoute = 'flow' | 'back' | 'attachment';

export interface PlacedNode<N> {
  node: N;
  x: number;
  y: number;
  /** Column index, shared with the application a hanging node belongs to. */
  column: number;
  /** A database or external service drawn below its application. */
  attached: boolean;
  /** Side of the icon box. */
  size: number;
  /** Width given to the label and caption. */
  textWidth: number;
  /** Icon and text boxes: links never run through them. */
  boxes: Box[];
}

export interface PlacedEdge<E> {
  edge: E;
  /** SVG path data from the source to the target. */
  path: string;
  route: EdgeRoute;
}

export interface MapLayout<N, E> {
  width: number;
  height: number;
  /** x of every column, for the guide lines. */
  columns: number[];
  nodes: PlacedNode<N>[];
  edges: PlacedEdge<E>[];
}

export interface LayoutOptions<N> {
  /** Room available; columns spread to fill it, never closer than the corridor. */
  width?: number;
  /** Width (px) of a node's label and caption; capped at `MAP_SIZES.maxText`. */
  measure?: (node: N) => number;
}

const isHanging = (node: LayoutNode) =>
  node.kind === 'database' || node.kind === 'external';

/** Owner of each database or external node: the first column node calling it. */
function findOwners(
  byId: Map<string, LayoutNode>,
  edges: LayoutEdge[],
): Map<string, string> {
  const owners = new Map<string, string>();
  for (const { source, target } of edges) {
    const from = byId.get(source);
    const to = byId.get(target);
    if (!from || !to || owners.has(target)) continue;
    if (isHanging(to) && !isHanging(from)) owners.set(target, source);
  }
  return owners;
}

/** Edges that close a cycle, found by a depth-first walk from the sources. */
function findBackEdges(ids: string[], edges: LayoutEdge[]): Set<LayoutEdge> {
  const out = new Map<string, LayoutEdge[]>(ids.map((id) => [id, []]));
  const incoming = new Set<string>();
  for (const edge of edges) {
    out.get(edge.source)?.push(edge);
    incoming.add(edge.target);
  }
  const back = new Set<LayoutEdge>();
  const state = new Map<string, 'open' | 'done'>();
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const edge of out.get(id) ?? []) {
      const next = state.get(edge.target);
      if (next === 'open') back.add(edge);
      else if (next === undefined) visit(edge.target);
    }
    state.set(id, 'done');
  };
  for (const id of ids) if (!incoming.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  return back;
}

/** Longest-path columns; sources other than clients move next to what they feed. */
function assignColumns(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): Map<string, number> {
  const column = new Map(nodes.map((n) => [n.id, 0]));
  // Relax until stable: at most one pass per node in an acyclic graph.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const { source, target } of edges) {
      const next = column.get(source)! + 1;
      if (next > column.get(target)!) {
        column.set(target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const incoming = new Set(edges.map((e) => e.target));
  for (const node of nodes) {
    if (node.kind === 'client' || incoming.has(node.id)) continue;
    const next = edges
      .filter((e) => e.source === node.id)
      .map((e) => column.get(e.target)!);
    if (next.length) column.set(node.id, Math.max(0, Math.min(...next) - 1));
  }
  const min = Math.min(0, ...column.values());
  for (const [id, c] of column) column.set(id, c - min);
  return column;
}

/** A pair of slots in adjacent columns joined by (a piece of) a link. */
type Segment = [string, string];

/**
 * Orders each column to minimize crossings: barycenter sweeps down and up, then
 * swaps of neighbors while they help. Keeps the best order seen.
 */
function orderColumns(columns: string[][], segments: Segment[][]): string[][] {
  const pos = new Map<string, number>();
  const index = () =>
    columns.forEach((ids) => ids.forEach((id, i) => pos.set(id, i)));
  index();
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const list of segments)
    for (const [u, v] of list) {
      preds.set(v, [...(preds.get(v) ?? []), u]);
      succs.set(u, [...(succs.get(u) ?? []), v]);
    }
  const crossingsAt = (c: number) => {
    const list = segments[c] ?? [];
    let count = 0;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = list[i]!;
        const [p, q] = list[j]!;
        if ((pos.get(a)! - pos.get(p)!) * (pos.get(b)! - pos.get(q)!) < 0)
          count++;
      }
    return count;
  };
  const total = () => columns.reduce((sum, _, c) => sum + crossingsAt(c), 0);
  const sortBy = (c: number, neighbors: Map<string, string[]>) => {
    const score = new Map(
      columns[c]!.map((id) => {
        const near = neighbors.get(id) ?? [];
        return [
          id,
          near.length
            ? near.reduce((s, n) => s + pos.get(n)!, 0) / near.length
            : pos.get(id)!,
        ];
      }),
    );
    columns[c]!.sort((a, b) => score.get(a)! - score.get(b)!);
    columns[c]!.forEach((id, i) => pos.set(id, i));
  };
  const local = (c: number) => crossingsAt(c - 1) + crossingsAt(c);
  const transpose = () => {
    for (let round = 0; round < 4; round++) {
      let improved = false;
      columns.forEach((ids, c) => {
        for (let i = 0; i + 1 < ids.length; i++) {
          const before = local(c);
          [ids[i], ids[i + 1]] = [ids[i + 1]!, ids[i]!];
          pos.set(ids[i]!, i);
          pos.set(ids[i + 1]!, i + 1);
          if (local(c) < before) improved = true;
          else {
            [ids[i], ids[i + 1]] = [ids[i + 1]!, ids[i]!];
            pos.set(ids[i]!, i);
            pos.set(ids[i + 1]!, i + 1);
          }
        }
      });
      if (!improved) break;
    }
  };

  let best = columns.map((ids) => [...ids]);
  let bestCount = total();
  for (let iteration = 0; iteration < 12 && bestCount > 0; iteration++) {
    if (iteration % 2 === 0)
      for (let c = 1; c < columns.length; c++) sortBy(c, preds);
    else for (let c = columns.length - 2; c >= 0; c--) sortBy(c, succs);
    transpose();
    const count = total();
    if (count < bestCount) {
      best = columns.map((ids) => [...ids]);
      bestCount = count;
    }
  }
  return best;
}

const r = (value: number) => Math.round(value * 10) / 10;

/** Turns a list of points into a path: straight runs, S-curves between rows. */
class PathBuilder {
  private d: string;
  private x: number;
  private y: number;
  constructor(x: number, y: number) {
    this.d = `M${r(x)},${r(y)}`;
    this.x = x;
    this.y = y;
  }
  line(x: number, y: number) {
    if (x !== this.x || y !== this.y) this.d += ` L${r(x)},${r(y)}`;
    this.x = x;
    this.y = y;
    return this;
  }
  /** Horizontal S-curve to (x, y); a straight line when the row is the same. */
  curve(x: number, y: number) {
    if (Math.abs(y - this.y) < 0.5) return this.line(x, y);
    const mid = (this.x + x) / 2;
    this.d += ` C${r(mid)},${r(this.y)} ${r(mid)},${r(y)} ${r(x)},${r(y)}`;
    this.x = x;
    this.y = y;
    return this;
  }
  /** Right-angle turn through the corner (cx, cy) to (x, y), rounded. */
  corner(cx: number, cy: number, x: number, y: number, radius = 8) {
    const r1 = Math.min(
      radius,
      Math.abs(cx - this.x) + Math.abs(cy - this.y),
      Math.abs(x - cx) + Math.abs(y - cy),
    );
    const towards = (fx: number, fy: number, tx: number, ty: number) => {
      const length = Math.hypot(tx - fx, ty - fy) || 1;
      return [tx + ((fx - tx) / length) * r1, ty + ((fy - ty) / length) * r1];
    };
    const [ax, ay] = towards(this.x, this.y, cx, cy);
    const [bx, by] = towards(x, y, cx, cy);
    this.line(ax!, ay!);
    this.d += ` Q${r(cx)},${r(cy)} ${r(bx!)},${r(by!)}`;
    this.x = bx!;
    this.y = by!;
    return this;
  }
  toString() {
    return this.d;
  }
}

interface Slot {
  id: string;
  /** A lane reserved for a link crossing the column. */
  dummy: boolean;
  y: number;
}

type Route<E> =
  | { kind: 'attachment'; edge: E }
  | { kind: 'chain'; edge: E; lanes: string[] }
  | { kind: 'loop'; edge: E; index: number };

/** Places the nodes and routes the edges. */
export function layoutMap<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions<N> = {},
): MapLayout<N, E> {
  const S = MAP_SIZES;
  const width = options.width ?? 0;
  const textWidth = (node: N) =>
    Math.min(S.maxText, options.measure?.(node) ?? S.defaultText);
  const byId = new Map<string, N>(nodes.map((n) => [n.id, n]));
  const known = edges.filter(
    (e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target,
  );
  const owners = findOwners(byId, known);
  const flowNodes = nodes.filter((n) => !owners.has(n.id));
  const flowIds = new Set(flowNodes.map((n) => n.id));
  const flowEdges = known.filter(
    (e) => flowIds.has(e.source) && flowIds.has(e.target),
  );
  const back = findBackEdges([...flowIds], flowEdges);
  const column = assignColumns(
    flowNodes,
    flowEdges.filter((e) => !back.has(e)),
  );
  const count = flowNodes.length ? Math.max(...column.values()) + 1 : 0;
  const hanging = new Map<string, N[]>();
  for (const node of nodes) {
    const owner = owners.get(node.id);
    if (owner) hanging.set(owner, [...(hanging.get(owner) ?? []), node]);
  }
  /** The column node an edge end sits on (a hanging node's owner). */
  const anchorOf = (id: string) => owners.get(id) ?? id;
  const columnOf = (id: string) => column.get(anchorOf(id))!;

  // Routes: hanging nodes, forward chains with a lane per skipped column, loops.
  const columns: string[][] = Array.from({ length: count }, () => []);
  for (const node of flowNodes) columns[column.get(node.id)!]!.push(node.id);
  const segments: Segment[][] = Array.from({ length: count }, () => []);
  let loops = 0;
  const routes: Route<E>[] = known.map((edge, e) => {
    if (owners.get(edge.target) === edge.source)
      return { kind: 'attachment', edge };
    const from = columnOf(edge.source);
    const to = columnOf(edge.target);
    if (back.has(edge) || to <= from)
      return { kind: 'loop', edge, index: loops++ };
    const lanes: string[] = [];
    let previous = anchorOf(edge.source);
    for (let c = from + 1; c <= to; c++) {
      const id = c === to ? anchorOf(edge.target) : `~${e}:${c}`;
      if (c < to) {
        lanes.push(id);
        columns[c]!.push(id);
      }
      segments[c - 1]!.push([previous, id]);
      previous = id;
    }
    return { kind: 'chain', edge, lanes };
  });
  const ordered = orderColumns(columns, segments);

  // Stack each column, then center it on the shared midline (y = 0).
  const sizeOf = (id: string) => ICON_SIZES[byId.get(id)!.kind];
  const slots = new Map<string, Slot>();
  const placed = new Map<string, PlacedNode<N>>();
  ordered.forEach((ids, c) => {
    let y = 0;
    let previousDummy: boolean | null = null;
    const anchors: number[] = [];
    const members: string[] = [];
    for (const id of ids) {
      const dummy = !byId.has(id);
      if (previousDummy !== null)
        y += dummy || previousDummy ? S.laneGap : S.gap;
      previousDummy = dummy;
      if (dummy) {
        slots.set(id, { id, dummy, y });
        anchors.push(y);
        members.push(id);
        continue;
      }
      const size = sizeOf(id);
      y += S.text + size / 2;
      const node = byId.get(id)!;
      slots.set(id, { id, dummy, y });
      anchors.push(y);
      members.push(id);
      placed.set(id, {
        node,
        x: 0,
        y,
        column: c,
        attached: false,
        size,
        textWidth: textWidth(node),
        boxes: [],
      });
      let bottom = y + size / 2;
      (hanging.get(id) ?? []).forEach((child, i) => {
        const childSize = ICON_SIZES[child.kind];
        const childY =
          y + size / 2 + S.hangingTop + childSize / 2 + i * S.attachment;
        placed.set(child.id, {
          node: child,
          x: 0,
          y: childY,
          column: c,
          attached: true,
          size: childSize,
          textWidth: textWidth(child),
          boxes: [],
        });
        members.push(child.id);
        bottom = childY + Math.max(childSize, S.hangingText) / 2;
      });
      y = bottom;
    }
    const shift = anchors.length
      ? -(anchors[0]! + anchors[anchors.length - 1]!) / 2
      : 0;
    for (const id of members) {
      const slot = slots.get(id);
      if (slot) slot.y += shift;
      const p = placed.get(id);
      if (p) p.y += shift;
    }
  });

  // Column x: each column's labels, then a free corridor, then the next column.
  const leftExtent = (c: number) =>
    Math.max(
      0,
      ...ordered[c]!.filter((id) => byId.has(id)).map(
        (id) => sizeOf(id) / 2 + 4,
      ),
    );
  const rightExtent = (c: number) =>
    Math.max(
      0,
      ...[...placed.values()]
        .filter((p) => p.column === c)
        .map((p) =>
          p.attached
            ? S.indent + p.size / 2 + S.textGap + p.textWidth
            : Math.max(p.size / 2, p.textWidth - p.size / 2 - 4),
        ),
    );
  const loopsInto = (c: number) =>
    routes.filter((ro) => ro.kind === 'loop' && columnOf(ro.edge.target) === c)
      .length;
  const loopsOutOfLast = routes.filter(
    (ro) => ro.kind === 'loop' && columnOf(ro.edge.source) === count - 1,
  ).length;
  const columnX: number[] = [];
  for (let c = 0; c < count; c++) {
    columnX.push(
      c === 0
        ? S.padX + loopsInto(0) * S.loopStep + leftExtent(0)
        : columnX[c - 1]! + rightExtent(c - 1) + S.corridor + leftExtent(c),
    );
  }
  const rightMargin = S.padX + loopsOutOfLast * S.loopStep;
  const natural = count
    ? columnX[count - 1]! + rightExtent(count - 1) + rightMargin
    : 2 * S.padX;
  if (count > 1 && width > natural) {
    const extra = (width - natural) / (count - 1);
    for (let c = 1; c < count; c++) columnX[c] = columnX[c]! + extra * c;
  }
  for (const p of placed.values())
    p.x = columnX[p.column]! + (p.attached ? S.indent : 0);
  /** Where links leave column c's right side and reach column c + 1's left side. */
  const corridorStart = (c: number) => columnX[c]! + rightExtent(c) + 4;
  const corridorEnd = (c: number) =>
    c + 1 < count ? columnX[c + 1]! - leftExtent(c + 1) - 4 : Infinity;

  // Vertical bounds, including one lane per loop below every node.
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of placed.values()) {
    top = Math.min(
      top,
      p.y - (p.attached ? S.hangingText / 2 : p.size / 2 + S.text),
    );
    bottom = Math.max(
      bottom,
      p.y + (p.attached ? Math.max(p.size, S.hangingText) / 2 : p.size / 2),
    );
  }
  for (const slot of slots.values()) {
    top = Math.min(top, slot.y);
    bottom = Math.max(bottom, slot.y);
  }
  if (!Number.isFinite(top)) top = bottom = 0;
  const loopLane = (index: number) => bottom + S.laneGap + index * S.loopStep;
  if (loops) bottom = loopLane(loops - 1);
  const offset = S.padY - top;
  for (const p of placed.values()) p.y += offset;
  for (const slot of slots.values()) slot.y += offset;

  // Ports: links sharing an icon side spread over it, in the order of their other end.
  const yOf = (id: string) => (placed.get(id) ?? slots.get(id))!.y;
  const firstHop = (ro: Route<E>, side: 'out' | 'in') => {
    if (ro.kind === 'loop') return Infinity;
    if (ro.kind !== 'chain') return 0;
    const path = [ro.edge.source, ...ro.lanes, ro.edge.target];
    return yOf(side === 'out' ? path[1]! : path[path.length - 2]!);
  };
  const ports = new Map<Route<E>, { out: number; in: number }>();
  for (const ro of routes) ports.set(ro, { out: 0, in: 0 });
  for (const p of placed.values()) {
    if (p.attached) continue;
    for (const side of ['out', 'in'] as const) {
      const list = routes
        .filter(
          (ro) =>
            ro.kind !== 'attachment' &&
            (side === 'out' ? ro.edge.source : ro.edge.target) === p.node.id,
        )
        .sort((a, b) => firstHop(a, side) - firstHop(b, side));
      const spread = Math.min(p.size - 12, (list.length - 1) * S.port);
      list.forEach((ro, i) => {
        ports.get(ro)![side] =
          list.length > 1 ? -spread / 2 + (i * spread) / (list.length - 1) : 0;
      });
    }
  }

  const endOf = (id: string, port: number) => {
    const p = placed.get(id)!;
    return { x: p.x - p.size / 2, y: p.y + (p.attached ? 0 : port) };
  };
  const startOf = (id: string, port: number) => {
    const p = placed.get(id)!;
    return { x: p.x + p.size / 2, y: p.y + port };
  };

  const routed: PlacedEdge<E>[] = routes.map((ro) => {
    const { edge } = ro;
    if (ro.kind === 'attachment') {
      const from = placed.get(edge.source)!;
      const to = placed.get(edge.target)!;
      const path = new PathBuilder(from.x, from.y + from.size / 2)
        .corner(from.x, to.y, to.x - to.size / 2, to.y)
        .toString();
      return { edge, route: 'attachment', path };
    }
    const port = ports.get(ro)!;
    const start = startOf(edge.source, port.out);
    const end = endOf(edge.target, port.in);
    const path = new PathBuilder(start.x, start.y);
    const from = columnOf(edge.source);
    const to = columnOf(edge.target);
    if (ro.kind === 'chain') {
      let y = start.y;
      for (let c = from; c < to; c++) {
        const next = c + 1 === to ? end.y : yOf(ro.lanes[c - from]!);
        path.line(corridorStart(c), y).curve(corridorEnd(c), next);
        y = next;
      }
      path.line(end.x, end.y);
      return { edge, route: 'flow', path: path.toString() };
    }
    // A loop: down the corridor right of the source column, along its lane, then
    // up the corridor left of the target column.
    const lane = loopLane(ro.index) + offset;
    const down =
      from + 1 < count
        ? corridorStart(from) + S.loopStep * (ro.index + 1)
        : corridorStart(from) + S.loopStep * (ro.index + 1);
    const up =
      to > 0
        ? corridorEnd(to - 1) - S.loopStep * (ro.index + 1)
        : columnX[0]! - leftExtent(0) - S.loopStep * (ro.index + 1);
    path
      .line(down - S.loopStep, start.y)
      .corner(down, start.y, down, lane)
      .corner(down, lane, up, lane)
      .corner(up, lane, up, end.y)
      .corner(up, end.y, end.x, end.y);
    return { edge, route: 'back', path: path.toString() };
  });

  for (const p of placed.values()) {
    const icon: Box = {
      left: p.x - p.size / 2,
      top: p.y - p.size / 2,
      right: p.x + p.size / 2,
      bottom: p.y + p.size / 2,
    };
    const text: Box = p.attached
      ? {
          left: icon.right + S.textGap,
          top: p.y - S.hangingText / 2,
          right: icon.right + S.textGap + p.textWidth,
          bottom: p.y + S.hangingText / 2,
        }
      : {
          left: icon.left - 4,
          top: icon.top - S.text,
          right: icon.left - 4 + p.textWidth,
          bottom: icon.top - 2,
        };
    p.boxes = [icon, text];
  }

  return {
    width: Math.floor(Math.max(width, natural)),
    height: Math.ceil(bottom + offset + S.padY),
    columns: columnX,
    nodes: [...placed.values()],
    edges: routed,
  };
}
