import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PageQueryDto, RangeQueryDto } from './query.dto.js';

/** Same transform + validation the global ValidationPipe applies to query strings. */
function errorsOf<T extends object>(
  cls: new () => T,
  query: Record<string, string>,
): string[] {
  const instance = plainToInstance(cls, query);
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('RangeQueryDto', () => {
  it('accepts no params, a preset, or zoned date-times', () => {
    expect(errorsOf(RangeQueryDto, {})).toEqual([]);
    expect(errorsOf(RangeQueryDto, { range: '15d' })).toEqual([]);
    expect(
      errorsOf(RangeQueryDto, {
        from: '2026-10-30T12:00:00Z',
        to: '2026-10-30T14:00:00.500+02:00',
      }),
    ).toEqual([]);
  });

  it('rejects unknown ranges', () => {
    expect(errorsOf(RangeQueryDto, { range: '2h' })).not.toEqual([]);
  });

  it.each([
    ['a date without a time', '2026-10-30'],
    ['a date-time without a time zone', '2026-10-30T12:00:00'],
    ['garbage', 'yesterday'],
    ['an impossible date', '2026-02-30T12:00:00Z'],
  ])('rejects %s', (_, from) => {
    expect(errorsOf(RangeQueryDto, { from })).not.toEqual([]);
  });

  it('explains the missing time zone', () => {
    expect(errorsOf(RangeQueryDto, { to: '2026-10-30T12:00:00' })).toContain(
      'to must include a time and a time zone (Z or +hh:mm), e.g. 2026-10-30T12:00:00Z',
    );
  });
});

describe('PageQueryDto', () => {
  const base = { project: 'shop' };

  it('requires a project and accepts optional scope, page and window', () => {
    expect(errorsOf(PageQueryDto, {})).not.toEqual([]);
    expect(
      errorsOf(PageQueryDto, {
        ...base,
        application: '0192b8c2-1a2b-7c3d-8e4f-123456789abc',
        instance: 'node-1',
        limit: '50',
        cursor: 'abc',
        range: '24h',
      }),
    ).toEqual([]);
  });

  it('rejects unknown params, as the API does', () => {
    expect(errorsOf(PageQueryDto, { ...base, sort: 'asc' })).toContain(
      'property sort should not exist',
    );
  });

  it('converts the limit from the query string', () => {
    const query = plainToInstance(PageQueryDto, { ...base, limit: '25' });
    expect(query.limit).toBe(25);
  });

  it.each(['0', '501', '2.5', 'ten'])('rejects limit=%s', (limit) => {
    expect(errorsOf(PageQueryDto, { ...base, limit })).not.toEqual([]);
  });

  it('rejects a non-uuid application and an overlong instance', () => {
    expect(
      errorsOf(PageQueryDto, { ...base, application: 'app-1' }),
    ).not.toEqual([]);
    expect(
      errorsOf(PageQueryDto, { ...base, instance: 'x'.repeat(101) }),
    ).not.toEqual([]);
  });
});
