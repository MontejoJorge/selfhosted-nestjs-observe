import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  daysUntilDropped,
  seriesOf,
  splitValue,
  tableLabel,
  toSegments,
  trimCutoffDay,
  utcToday,
} from './storage-math';

describe('day arithmetic (UTC)', () => {
  it('gets today in UTC', () => {
    expect(utcToday(Date.parse('2026-10-30T23:59:59Z'))).toBe('2026-10-30');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-30', 2)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts whole days between two days', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
    expect(daysBetween('2026-10-30', '2026-10-30')).toBe(0);
  });
});

describe('trim and retention rules', () => {
  it('computes the trim cutoff like the API (today - keepDays)', () => {
    expect(trimCutoffDay(7, '2026-10-31')).toBe('2026-10-24');
  });

  it('counts the days before retention drops a partition', () => {
    // 14 days kept: the partition of today - 14 is still kept and goes tomorrow
    expect(daysUntilDropped('2026-10-16', 14, '2026-10-30')).toBe(1);
    expect(daysUntilDropped('2026-10-30', 14, '2026-10-30')).toBe(15);
  });
});

describe('usage series', () => {
  it('folds the small tables into "other"', () => {
    expect(seriesOf('requests')).toBe('requests');
    expect(seriesOf('logs')).toBe('logs');
    expect(seriesOf('error_occurrences')).toBe('error_occurrences');
    expect(seriesOf('profiles')).toBe('other');
    expect(seriesOf('unknown_table')).toBe('other');
  });

  it('sums parts into the fixed series order and drops empty ones', () => {
    const segments = toSegments([
      { table: 'profiles', bytes: 10 },
      { table: 'logs', bytes: 200 },
      { table: 'jobs', bytes: 5 },
      { table: 'requests', bytes: 0 },
    ]);
    expect(segments.map((s) => [s.key, s.bytes])).toEqual([
      ['logs', 200],
      ['other', 15],
    ]);
  });

  it('labels known tables and passes others through', () => {
    expect(tableLabel('error_occurrences')).toBe('Errors');
    expect(tableLabel('mystery')).toBe('mystery');
  });
});

describe('splitValue', () => {
  it('splits a formatted value from its unit', () => {
    expect(splitValue('1.93 GB')).toEqual(['1.93', 'GB']);
    expect(splitValue('–')).toEqual(['–', undefined]);
  });
});
