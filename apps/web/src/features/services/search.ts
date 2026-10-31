import type { ServiceDto } from '@/lib/api/generated/api';
import { optionalEnum, optionalNumber, optionalString } from '@/lib/search';
import { z } from 'zod';

export const COMPARISONS = ['gte', 'lte'] as const;
export type Comparison = (typeof COMPARISONS)[number];

/** Rows per page of the services table; the first one is the default. */
export const PAGE_SIZES = ['8', '25', '50', '100'] as const;

/**
 * /services: one class, and thresholds on the average own and total time per call
 * (`ownMs` with `ownOp`, `totalMs` with `totalOp`; the operator defaults to ≥), and the
 * table's rows per page (`pageSize`).
 */
export const servicesSearch = z.object({
  className: optionalString,
  ownOp: optionalEnum(COMPARISONS),
  ownMs: optionalNumber,
  totalOp: optionalEnum(COMPARISONS),
  totalMs: optionalNumber,
  pageSize: optionalEnum(PAGE_SIZES),
});

export type ServicesSearch = z.output<typeof servicesSearch>;

function passes(
  value: number,
  op: Comparison | undefined,
  threshold: number | undefined,
): boolean {
  if (threshold === undefined) return true;
  return op === 'lte' ? value <= threshold : value >= threshold;
}

export const avgOwnMs = (service: ServiceDto) =>
  service.calls > 0 ? service.selfMs / service.calls : 0;

export const avgTotalMs = (service: ServiceDto) =>
  service.calls > 0 ? service.totalMs / service.calls : 0;

export function filterServices(
  services: readonly ServiceDto[],
  search: ServicesSearch,
): ServiceDto[] {
  return services.filter(
    (service) =>
      (search.className === undefined ||
        service.className === search.className) &&
      passes(avgOwnMs(service), search.ownOp, search.ownMs) &&
      passes(avgTotalMs(service), search.totalOp, search.totalMs),
  );
}
