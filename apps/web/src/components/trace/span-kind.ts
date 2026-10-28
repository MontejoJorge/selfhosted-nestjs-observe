import type { Primitive, TraceSpan } from '@selfhosted-observe/contracts';

export type SpanKind = 'db' | 'http' | 'code';

const DB_KEY = /(^|[._])(db|sql|statement|query|collection|table)([._]|$)/i;
const HTTP_KEY = /(^|[._])(http|url|host|fetch)([._]|$)/i;

/** Tag keys whose value best summarizes a span, in priority order. */
const SUMMARY_KEYS = [
  'db.statement',
  'statement',
  'query',
  'sql',
  'http.url',
  'url',
  'http.target',
  'target',
];

export function spanKind(span: TraceSpan): SpanKind {
  const keys = Object.keys(span.tags);
  if (keys.some((key) => DB_KEY.test(key))) return 'db';
  if (keys.some((key) => HTTP_KEY.test(key))) return 'http';
  return 'code';
}

export function spanLabel(span: TraceSpan): string {
  if (span.name) return span.name;
  return span.methodName
    ? `${span.className}.${span.methodName}`
    : span.className;
}

export function spanSummary(tags: Record<string, Primitive>): string | null {
  for (const key of SUMMARY_KEYS) {
    const value = tags[key];
    if (value !== undefined && value !== '') return String(value);
  }
  return null;
}

export function spanFailed(span: TraceSpan): boolean {
  return span.error !== null && span.error !== false;
}

export interface FlatSpan {
  /** Stable path id such as `0.2.1`. */
  id: string;
  span: TraceSpan;
  depth: number;
  /** Absolute start offset in ms, inherited from the parent when missing. */
  start: number;
  duration: number | null;
}

/** Flattens the span tree in display order, skipping children of collapsed rows. */
export function flattenSpans(
  spans: readonly TraceSpan[],
  collapsed: ReadonlySet<string>,
): FlatSpan[] {
  const rows: FlatSpan[] = [];
  const visit = (
    nodes: readonly TraceSpan[],
    depth: number,
    parentId: string,
    parentStart: number,
  ) => {
    nodes.forEach((span, index) => {
      const id = parentId ? `${parentId}.${index}` : String(index);
      const start = span.startOffsetMs ?? parentStart;
      rows.push({ id, span, depth, start, duration: span.durationMs });
      if (span.children.length > 0 && !collapsed.has(id)) {
        visit(span.children, depth + 1, id, start);
      }
    });
  };
  visit(spans, 0, '', 0);
  return rows;
}

export function countSpans(spans: readonly TraceSpan[]): number {
  let count = 0;
  for (const span of spans) count += 1 + countSpans(span.children);
  return count;
}

/** The latest end time across the tree, used to size the time axis. */
export function maxSpanEnd(
  spans: readonly TraceSpan[],
  parentStart = 0,
): number {
  let max = 0;
  for (const span of spans) {
    const start = span.startOffsetMs ?? parentStart;
    max = Math.max(
      max,
      start + (span.durationMs ?? 0),
      maxSpanEnd(span.children, start),
    );
  }
  return max;
}

export function collectParentIds(
  spans: readonly TraceSpan[],
  parentId = '',
): string[] {
  const ids: string[] = [];
  spans.forEach((span, index) => {
    const id = parentId ? `${parentId}.${index}` : String(index);
    if (span.children.length > 0) {
      ids.push(id, ...collectParentIds(span.children, id));
    }
  });
  return ids;
}
