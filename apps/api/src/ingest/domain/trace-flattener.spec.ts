import { describe, expect, it } from 'vitest';
import { flattenTrace, type ExecutionRef } from './trace-flattener.js';
import type { WireTraceNode } from './wire.js';

const execution: ExecutionRef = {
  executionId: 'exec-1',
  calledAt: new Date('2026-10-30T12:00:00Z'),
  source: 'request',
  serviceId: 'svc',
  traceId: 'trace-1',
  operation: 'GET /users',
};

const node = (
  name: string,
  d: number | undefined,
  ch: WireTraceNode[] = [],
  extra: Partial<WireTraceNode> = {},
): WireTraceNode => ({
  s: `span-${name}`,
  n: name,
  o: 'auto',
  c: `${name}Class`,
  m: `${name}Method`,
  d,
  ch,
  ...extra,
});

describe('flattenTrace', () => {
  it('flattens depth-first with positions, parents and depths', () => {
    const spans = flattenTrace(execution, [
      node('a', 100, [node('b', 30, [node('c', 10)]), node('d', 20)]),
      node('e', 5),
    ]);
    expect(
      spans.map((s) => [
        s.name,
        s.position,
        s.parentPosition,
        s.depth,
        s.parentSpanId,
      ]),
    ).toEqual([
      ['a', 0, null, 0, null],
      ['b', 1, 0, 1, 'span-a'],
      ['c', 2, 1, 2, 'span-b'],
      ['d', 3, 0, 1, 'span-a'],
      ['e', 4, null, 0, null],
    ]);
    expect(spans[0]).toMatchObject(execution);
  });

  it('computes self time as duration minus direct children, at least 0', () => {
    const spans = flattenTrace(execution, [
      node('a', 100, [node('b', 30, [node('c', 10)]), node('d', 20)]),
      // concurrent children adding up to more than their parent
      node('p', 10, [node('x', 8), node('y', 8)]),
      node('n', undefined, [node('z', 4)]),
    ]);
    const self = Object.fromEntries(spans.map((s) => [s.name, s.selfMs]));
    expect(self).toMatchObject({ a: 50, b: 20, c: 10, d: 20, p: 0, n: null });
  });

  it('applies defaults and reads errors', () => {
    const [plain, failed, detailed] = flattenTrace(execution, [
      { o: undefined, c: undefined, m: undefined } as unknown as WireTraceNode,
      node('f', 1, [], { e: true }),
      node('g', 1, [], { e: { cls: 'TypeError', message: 'x' } }),
    ]);
    expect(plain).toMatchObject({
      origin: 'auto',
      className: '',
      methodName: '',
      spanId: null,
      name: null,
      durationMs: null,
      hasError: false,
      error: null,
    });
    expect(failed).toMatchObject({ hasError: true, error: true });
    expect(detailed).toMatchObject({
      hasError: true,
      error: { cls: 'TypeError', message: 'x' },
    });
  });

  it('skips nodes that are not objects', () => {
    const spans = flattenTrace(execution, [
      null,
      'junk',
      node('a', 1, [42 as unknown as WireTraceNode]),
    ] as unknown as WireTraceNode[]);
    expect(spans.map((s) => s.name)).toEqual(['a']);
  });

  it('stops at 10 000 spans per execution', () => {
    const roots = Array.from({ length: 10_050 }, (_, i) => node(`n${i}`, 1));
    expect(flattenTrace(execution, roots)).toHaveLength(10_000);
  });

  it('returns no spans for an empty trace', () => {
    expect(flattenTrace(execution, [])).toEqual([]);
  });
});
