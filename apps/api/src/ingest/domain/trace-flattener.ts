import type { WireTraceNode } from '@selfhosted-observe/contracts';
import type { ExecutionSource, SpanRecord } from './telemetry.js';
import { asNumber, asString, asTags, isRecord } from './wire-readers.js';

export interface ExecutionRef {
  executionId: string;
  calledAt: Date;
  source: ExecutionSource;
  serviceId: string;
  traceId: string;
}

/** Hard cap so a pathological tree can't blow up one batch. */
const MAX_SPANS_PER_EXECUTION = 10_000;

/** Flattens a span tree depth-first into rows carrying parent position, parent span id and depth. */
export function flattenTrace(
  execution: ExecutionRef,
  roots: WireTraceNode[],
): SpanRecord[] {
  const spans: SpanRecord[] = [];
  const stack: Array<{
    node: unknown;
    depth: number;
    parent: SpanRecord | null;
  }> = [];
  for (let i = roots.length - 1; i >= 0; i--)
    stack.push({ node: roots[i], depth: 0, parent: null });

  while (stack.length > 0 && spans.length < MAX_SPANS_PER_EXECUTION) {
    const { node, depth, parent } = stack.pop()!;
    if (!isRecord(node)) continue;
    const error =
      node.e === true
        ? true
        : isRecord(node.e)
          ? (node.e as unknown as SpanRecord['error'])
          : null;
    const span: SpanRecord = {
      ...execution,
      position: spans.length,
      parentPosition: parent?.position ?? null,
      depth,
      spanId: asString(node.s),
      parentSpanId: parent?.spanId ?? null,
      name: asString(node.n),
      origin: asString(node.o) ?? 'auto',
      className: asString(node.c) ?? '',
      methodName: asString(node.m) ?? '',
      durationMs: asNumber(node.d),
      startOffsetMs: asNumber(node.so),
      hasError: error !== null,
      tags: asTags(node.t),
      error,
    };
    spans.push(span);
    const children: unknown[] = Array.isArray(node.ch) ? node.ch : [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], depth: depth + 1, parent: span });
    }
  }
  return spans;
}
