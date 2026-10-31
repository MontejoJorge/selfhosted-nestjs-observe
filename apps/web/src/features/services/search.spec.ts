import type { ServiceDto } from '@/lib/api/generated/api';
import { parseSearch } from '@/lib/search';
import { describe, expect, it } from 'vitest';
import {
  avgOwnMs,
  avgTotalMs,
  filterServices,
  servicesSearch,
  type ServicesSearch,
} from './search';

const service = (
  className: string,
  calls: number,
  selfMs: number,
  totalMs: number,
) => ({ className, calls, selfMs, totalMs }) as ServiceDto;

const services = [
  service('UsersService', 10, 100, 500), // own 10, total 50
  service('OrdersService', 4, 200, 400), // own 50, total 100
  service('Idle', 0, 0, 0), // own 0, total 0
];

const search = (overrides: Partial<ServicesSearch> = {}): ServicesSearch => ({
  className: undefined,
  ownOp: undefined,
  ownMs: undefined,
  totalOp: undefined,
  totalMs: undefined,
  pageSize: undefined,
  ...overrides,
});

const names = (rows: ServiceDto[]) => rows.map((s) => s.className);

describe('servicesSearch', () => {
  it('parses thresholds, operators and page sizes', () => {
    expect(
      parseSearch(
        servicesSearch,
        new URLSearchParams('ownOp=lte&ownMs=20&pageSize=25&className=X'),
      ),
    ).toEqual(
      search({ className: 'X', ownOp: 'lte', ownMs: 20, pageSize: '25' }),
    );
  });

  it('drops unknown operators and page sizes', () => {
    expect(
      parseSearch(
        servicesSearch,
        new URLSearchParams('ownOp=eq&pageSize=7&totalMs=-3'),
      ),
    ).toEqual(search());
  });
});

describe('average times', () => {
  it('divides by calls and is 0 without calls', () => {
    expect(avgOwnMs(services[0])).toBe(10);
    expect(avgTotalMs(services[1])).toBe(100);
    expect(avgOwnMs(services[2])).toBe(0);
    expect(avgTotalMs(services[2])).toBe(0);
  });
});

describe('filterServices', () => {
  it('keeps everything without filters', () => {
    expect(filterServices(services, search())).toHaveLength(3);
  });

  it('filters by exact class name', () => {
    expect(
      names(filterServices(services, search({ className: 'Users' }))),
    ).toEqual([]);
    expect(
      names(filterServices(services, search({ className: 'UsersService' }))),
    ).toEqual(['UsersService']);
  });

  it('defaults the operator to >= and includes the threshold', () => {
    expect(names(filterServices(services, search({ ownMs: 10 })))).toEqual([
      'UsersService',
      'OrdersService',
    ]);
  });

  it('supports <= and combines own and total thresholds', () => {
    expect(
      names(filterServices(services, search({ ownOp: 'lte', ownMs: 10 }))),
    ).toEqual(['UsersService', 'Idle']);
    expect(
      names(
        filterServices(
          services,
          search({ ownMs: 5, totalOp: 'lte', totalMs: 60 }),
        ),
      ),
    ).toEqual(['UsersService']);
  });

  it('ignores an operator without a threshold', () => {
    expect(filterServices(services, search({ totalOp: 'lte' }))).toHaveLength(
      3,
    );
  });
});
