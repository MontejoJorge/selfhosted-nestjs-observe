import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';
import type { SpanTarget, TimeBreakdownFilters } from './queries';

/**
 * /time-breakdown: the breakdown filters plus the class.method whose slowest
 * spans are open in the side sheet (`className` + `methodName` + `origin`).
 */
export const timeBreakdownSearch = z.object({
  source: optionalEnum(['request', 'job']),
  operationId: optionalString,
  queue: optionalString,
  name: optionalString,
  className: optionalString,
  methodName: optionalString,
  origin: optionalString,
});

export type TimeBreakdownSearch = z.output<typeof timeBreakdownSearch>;

/** The API filters from the search: an operation only applies to requests, a job to jobs. */
export function breakdownFilters(
  search: TimeBreakdownSearch,
): TimeBreakdownFilters {
  const job = search.queue && search.name;
  return {
    source: search.source,
    operationId: search.source === 'job' ? undefined : search.operationId,
    queue: search.source === 'request' || !job ? undefined : search.queue,
    name: search.source === 'request' || !job ? undefined : search.name,
  };
}

/** The open drill-down target, if any. */
export function spanTarget(search: TimeBreakdownSearch): SpanTarget | null {
  if (!search.className || !search.methodName) return null;
  return {
    className: search.className,
    methodName: search.methodName,
    origin: search.origin,
  };
}

/** Stable identity of a class.method row (the same name can come from two origins). */
export function targetKey(target: SpanTarget): string {
  return `${target.origin ?? ''}:${target.className}.${target.methodName}`;
}
