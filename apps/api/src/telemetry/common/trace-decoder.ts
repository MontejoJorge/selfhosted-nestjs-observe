import type { Primitive, WireError } from '../../ingest/domain/wire.js';
import type { TraceSpanDto } from './common.dto.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === 'string' ? value : null);
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Decodes the stored wire span tree (single-letter keys) into the API shape. */
export function decodeTrace(nodes: unknown): TraceSpanDto[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(isRecord).map((node) => ({
    spanId: str(node.s),
    name: str(node.n),
    origin: node.o === 'manual' ? 'manual' : 'auto',
    className: str(node.c) ?? '',
    methodName: str(node.m) ?? '',
    durationMs: num(node.d),
    startOffsetMs: num(node.so),
    tags: isRecord(node.t) ? (node.t as Record<string, Primitive>) : {},
    error:
      node.e === true
        ? true
        : isRecord(node.e)
          ? (node.e as unknown as WireError)
          : null,
    children: decodeTrace(node.ch),
  }));
}

export function asTags(value: unknown): Record<string, Primitive> {
  return isRecord(value) ? (value as Record<string, Primitive>) : {};
}

export function asWireError(value: unknown): WireError | null {
  return isRecord(value) ? (value as unknown as WireError) : null;
}
