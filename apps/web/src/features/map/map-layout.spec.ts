import type { MapNodeKind } from '@/lib/api/generated/api';
import { describe, expect, it } from 'vitest';
import { layoutMap, MAP_SIZES, type Box, type MapLayout } from './map-layout';

type TestNode = { id: string; kind: MapNodeKind };
type TestEdge = { source: string; target: string };
type Layout = MapLayout<TestNode, TestEdge>;

const node = (id: string, kind: MapNodeKind): TestNode => ({ id, kind });
const edge = (source: string, target: string): TestEdge => ({ source, target });

const at = (layout: Layout, id: string) => {
  const placed = layout.nodes.find((p) => p.node.id === id);
  if (!placed) throw new Error(`${id} was not placed`);
  return placed;
};

type Point = [number, number];

/** Points along an SVG path made of M, L, C and Q commands. */
function sample(path: string, step = 2): Point[] {
  const tokens = path.match(/[MLCQ]|-?[\d.]+/g) ?? [];
  const points: Point[] = [];
  let i = 0;
  let current: Point = [0, 0];
  const read = (): Point => [Number(tokens[i++]), Number(tokens[i++])];
  while (i < tokens.length) {
    const command = tokens[i++];
    const controls: Point[] =
      command === 'C'
        ? [read(), read(), read()]
        : command === 'Q'
          ? [read(), read()]
          : [read()];
    const curve = [current, ...controls];
    const length = curve
      .slice(1)
      .reduce(
        (sum, p, k) =>
          sum + Math.hypot(p[0] - curve[k]![0], p[1] - curve[k]![1]),
        0,
      );
    const n = command === 'M' ? 1 : Math.max(1, Math.ceil(length / step));
    for (let s = command === 'M' ? 1 : 1; s <= n; s++) {
      const t = s / n;
      // De Casteljau on the control points.
      let layer = curve;
      while (layer.length > 1)
        layer = layer
          .slice(1)
          .map((p, k) => [
            layer[k]![0] + (p[0] - layer[k]![0]) * t,
            layer[k]![1] + (p[1] - layer[k]![1]) * t,
          ]);
      points.push(layer[0]!);
    }
    current = controls[controls.length - 1]!;
  }
  return points;
}

const inside = ([x, y]: Point, b: Box, margin = 1) =>
  x > b.left + margin &&
  x < b.right - margin &&
  y > b.top + margin &&
  y < b.bottom - margin;

/** Every edge point that falls inside a node's icon or text box. */
function hits(layout: Layout) {
  const found: string[] = [];
  for (const { edge: e, path } of layout.edges)
    for (const point of sample(path))
      for (const placed of layout.nodes)
        for (const box of placed.boxes)
          if (inside(point, box))
            found.push(`${e.source}>${e.target} hits ${placed.node.id}`);
  return [...new Set(found)];
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  const cross = (o: Point, p: Point, q: Point) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  // Half-open: a crossing exactly on a sample point still counts; collinear runs don't.
  if (d1 === 0 && d2 === 0) return false;
  return d1 < 0 !== d2 < 0 && d3 < 0 !== d4 < 0;
}

/** Pairs of edges whose paths cross, away from the nodes they share. */
function crossings(layout: Layout) {
  const lines = layout.edges.map((e) => ({
    e: e.edge,
    points: sample(e.path, 4),
  }));
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const ends = [
        ...a.points.slice(0, 1),
        ...a.points.slice(-1),
        ...b.points.slice(0, 1),
        ...b.points.slice(-1),
      ];
      const nearEnd = (p: Point) =>
        ends.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 12);
      let crossed = false;
      for (let s = 1; s < a.points.length && !crossed; s++)
        for (let t = 1; t < b.points.length && !crossed; t++) {
          const p = a.points[s - 1]!;
          if (nearEnd(p)) continue;
          if (intersects(p, a.points[s]!, b.points[t - 1]!, b.points[t]!))
            crossed = true;
        }
      if (crossed)
        found.push(`${a.e.source}>${a.e.target} x ${b.e.source}>${b.e.target}`);
    }
  return found;
}

/** A storefront-like project: two entry apps, queues, a worker and services. */
const store = {
  nodes: [
    node('clients', 'client'),
    node('cron', 'queue'),
    node('api', 'application'),
    node('worker', 'application'),
    node('emails', 'queue'),
    node('webhooks', 'queue'),
    node('db', 'database'),
    node('pokeapi', 'external'),
    node('smtp', 'external'),
  ],
  edges: [
    edge('clients', 'api'),
    edge('clients', 'worker'),
    edge('cron', 'api'),
    edge('api', 'emails'),
    edge('emails', 'worker'),
    edge('webhooks', 'worker'),
    edge('api', 'db'),
    edge('api', 'pokeapi'),
    edge('worker', 'smtp'),
  ],
};

describe('layoutMap', () => {
  it('returns an empty canvas for an empty map', () => {
    const layout = layoutMap([], []);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.columns).toEqual([]);
  });

  it('puts clients, applications, queues and workers in successive columns', () => {
    const layout = layoutMap(
      [
        node('worker', 'application'),
        node('emails', 'queue'),
        node('api', 'application'),
        node('clients', 'client'),
      ],
      [edge('clients', 'api'), edge('api', 'emails'), edge('emails', 'worker')],
    );
    expect(
      ['clients', 'api', 'emails', 'worker'].map((id) => at(layout, id).column),
    ).toEqual([0, 1, 2, 3]);
    expect(layout.columns).toHaveLength(4);
    expect(layout.edges.every((e) => e.route === 'flow')).toBe(true);
  });

  it('uses the longest path when a node is reached at two depths', () => {
    const layout = layoutMap(
      [
        node('clients', 'client'),
        node('api', 'application'),
        node('jobs', 'queue'),
        node('worker', 'application'),
      ],
      [
        edge('clients', 'api'),
        edge('api', 'jobs'),
        edge('jobs', 'worker'),
        edge('api', 'worker'),
      ],
    );
    expect(at(layout, 'worker').column).toBe(3);
  });

  it('moves a queue nobody feeds next to the application consuming it', () => {
    const layout = layoutMap(store.nodes, store.edges);
    expect(at(layout, 'webhooks').column).toBe(2);
    expect(at(layout, 'cron').column).toBe(0);
    expect(at(layout, 'clients').column).toBe(0);
  });

  it('hangs databases and external services below their application', () => {
    const layout = layoutMap(
      [
        node('clients', 'client'),
        node('api', 'application'),
        node('db', 'database'),
        node('stripe', 'external'),
      ],
      [edge('clients', 'api'), edge('api', 'db'), edge('api', 'stripe')],
    );
    const api = at(layout, 'api');
    const db = at(layout, 'db');
    const stripe = at(layout, 'stripe');
    expect(layout.columns).toHaveLength(2);
    expect(db).toMatchObject({ column: api.column, attached: true });
    expect(db.x).toBe(api.x + MAP_SIZES.indent);
    expect(db.y).toBeGreaterThan(api.y);
    expect(stripe.y - db.y).toBe(MAP_SIZES.attachment);
    expect(
      layout.edges.filter((e) => e.route === 'attachment').map((e) => e.edge),
    ).toEqual([edge('api', 'db'), edge('api', 'stripe')]);
  });

  it('routes a long edge around the nodes of the columns it skips', () => {
    const layout = layoutMap(store.nodes, store.edges);
    const long = layout.edges.find(
      (e) => e.edge.source === 'clients' && e.edge.target === 'worker',
    );
    expect(at(layout, 'worker').column - at(layout, 'clients').column).toBe(3);
    expect(long?.route).toBe('flow');
    expect(hits(layout)).toEqual([]);
  });

  it('draws the storefront-like project without crossings', () => {
    const layout = layoutMap(store.nodes, store.edges);
    expect(crossings(layout)).toEqual([]);
  });

  it('untangles a column given in a crossing order', () => {
    const layout = layoutMap(
      [
        node('clients', 'client'),
        node('a', 'application'),
        node('b', 'application'),
        node('qb', 'queue'),
        node('qa', 'queue'),
      ],
      [
        edge('clients', 'a'),
        edge('clients', 'b'),
        edge('a', 'qa'),
        edge('b', 'qb'),
      ],
    );
    expect(at(layout, 'a').y).toBeLessThan(at(layout, 'b').y);
    expect(at(layout, 'qa').y).toBeLessThan(at(layout, 'qb').y);
    const middle = (at(layout, 'a').y + at(layout, 'b').y) / 2;
    expect(at(layout, 'clients').y).toBeCloseTo(middle);
    expect(crossings(layout)).toEqual([]);
  });

  it('routes a link back to an earlier column below every node', () => {
    const layout = layoutMap(
      [
        node('clients', 'client'),
        node('billing', 'application'),
        node('invoices', 'queue'),
        node('stripe', 'external'),
      ],
      [
        edge('clients', 'billing'),
        edge('billing', 'invoices'),
        edge('billing', 'stripe'),
        edge('invoices', 'billing'),
      ],
    );
    expect(at(layout, 'invoices').column).toBe(2);
    const loop = layout.edges.find((e) => e.edge.source === 'invoices');
    expect(loop?.route).toBe('back');
    const lowest = Math.max(
      ...layout.nodes.flatMap((p) => p.boxes.map((b) => b.bottom)),
    );
    const ys = sample(loop!.path).map((p) => p[1]);
    expect(Math.max(...ys)).toBeGreaterThan(lowest);
    expect(Math.max(...ys)).toBeLessThan(layout.height);
    expect(hits(layout)).toEqual([]);
    expect(crossings(layout)).toEqual([]);
  });

  it('keeps every label clear of the next column, whatever its width', () => {
    const layout = layoutMap(store.nodes, store.edges, {
      measure: () => 400,
    });
    for (const placed of layout.nodes) {
      const next = layout.columns[placed.column + 1];
      if (next === undefined) continue;
      for (const box of placed.boxes) expect(box.right).toBeLessThan(next - 20);
    }
    expect(hits(layout)).toEqual([]);
  });

  it('spreads columns over the available width', () => {
    const nodes = [node('clients', 'client'), node('api', 'application')];
    const edges = [edge('clients', 'api')];
    const narrow = layoutMap(nodes, edges, { width: 300 });
    const wide = layoutMap(nodes, edges, { width: 1400 });
    expect(wide.columns[1]! - wide.columns[0]!).toBeGreaterThan(
      narrow.columns[1]! - narrow.columns[0]!,
    );
    expect(wide.width).toBe(1400);
    expect(narrow.width).toBeGreaterThan(300);
  });

  it('ignores edges to unknown nodes and self links', () => {
    const layout = layoutMap(
      [node('api', 'application')],
      [edge('api', 'api'), edge('api', 'ghost')],
    );
    expect(layout.edges).toEqual([]);
    expect(at(layout, 'api').column).toBe(0);
  });
});
