import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { windowFromId } from './id-window.js';
import { TIME_RANGES } from './query.dto.js';
import {
  bucketSeconds,
  bucketStarts,
  fillTimeline,
  RANGE_MS,
  resolveWindow,
  sortRanges,
  type TimeWindow,
} from './time-window.js';

const NOW = new Date('2026-10-30T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const windowOf = (ms: number): TimeWindow => ({
  from: new Date(NOW.getTime() - ms),
  to: NOW,
});

describe('resolveWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the last hour', () => {
    expect(resolveWindow({})).toEqual(windowOf(HOUR));
  });

  it('uses the range ending now', () => {
    expect(resolveWindow({ range: '7d' })).toEqual(windowOf(7 * DAY));
  });

  it('lets from/to win over range', () => {
    expect(
      resolveWindow({
        range: '7d',
        from: '2026-10-29T00:00:00Z',
        to: '2026-10-29T06:00:00+02:00',
      }),
    ).toEqual({
      from: new Date('2026-10-29T00:00:00Z'),
      to: new Date('2026-10-29T04:00:00Z'),
    });
  });

  it('ends a window with only `from` now, and one with only `to` at `to`', () => {
    expect(resolveWindow({ from: '2026-10-30T10:00:00Z' })).toEqual({
      from: new Date('2026-10-30T10:00:00Z'),
      to: NOW,
    });
    expect(resolveWindow({ range: '3h', to: '2026-10-29T12:00:00Z' })).toEqual({
      from: new Date('2026-10-29T09:00:00Z'),
      to: new Date('2026-10-29T12:00:00Z'),
    });
  });

  it('rejects from >= to', () => {
    expect(() =>
      resolveWindow({
        from: '2026-10-30T10:00:00Z',
        to: '2026-10-30T10:00:00Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts exactly 31 days and rejects more', () => {
    expect(() =>
      resolveWindow({
        from: '2026-09-29T12:00:00Z',
        to: '2026-10-30T12:00:00Z',
      }),
    ).not.toThrow();
    expect(() =>
      resolveWindow({
        from: '2026-09-29T11:59:59Z',
        to: '2026-10-30T12:00:00Z',
      }),
    ).toThrow(/31 days/);
  });
});

describe('sortRanges', () => {
  it('sorts by duration and drops duplicates', () => {
    expect(sortRanges(['7d', '1h', '24h', '1h'])).toEqual(['1h', '24h', '7d']);
  });

  it('knows a length for every range', () => {
    for (const range of TIME_RANGES) expect(RANGE_MS[range]).toBeGreaterThan(0);
  });
});

describe('bucketSeconds', () => {
  it.each([
    ['1h', 60],
    ['3h', 300],
    ['6h', 300],
    ['12h', 900],
    ['24h', 900],
    ['3d', 3600],
    ['7d', 10800],
    ['15d', 21600],
  ] as const)('gives %s buckets of %i s', (range, seconds) => {
    expect(bucketSeconds(windowOf(RANGE_MS[range]))).toBe(seconds);
  });

  it('keeps any window up to 31 days at 100 buckets or fewer', () => {
    for (const ms of [1, 60_000, 101 * 60_000, 25 * HOUR, 31 * DAY]) {
      const step = bucketSeconds(windowOf(ms));
      expect(ms / 1000 / step).toBeLessThanOrEqual(100);
    }
    expect(bucketSeconds(windowOf(31 * DAY))).toBe(43200);
  });
});

describe('bucketStarts', () => {
  it('starts at the bucket containing `from` and stops before `to`', () => {
    const starts = bucketStarts(
      {
        from: new Date('2026-10-30T12:00:30Z'),
        to: new Date('2026-10-30T12:03:00Z'),
      },
      60,
    );
    expect(starts.map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-30T12:00:00.000Z',
      '2026-10-30T12:01:00.000Z',
      '2026-10-30T12:02:00.000Z',
    ]);
  });

  it('aligns to the 2000-01-01 origin', () => {
    const [first] = bucketStarts(
      {
        from: new Date('2026-10-30T13:10:00Z'),
        to: new Date('2026-10-30T20:00:00Z'),
      },
      3 * 3600,
    );
    expect(new Date(first).toISOString()).toBe('2026-10-30T12:00:00.000Z');
  });
});

describe('fillTimeline', () => {
  it('fills missing buckets with zeros and keeps known rows', () => {
    const timeline = fillTimeline(
      {
        from: new Date('2026-10-30T12:00:00Z'),
        to: new Date('2026-10-30T12:03:00Z'),
      },
      60,
      [
        {
          t: new Date('2026-10-30T12:01:00Z'),
          count: 4,
          errors: 1,
          p95: 20,
          avg: null,
          status5xx: 1,
        },
      ],
    );
    expect(timeline).toEqual([
      expect.objectContaining({ t: '2026-10-30T12:00:00.000Z', count: 0 }),
      {
        t: '2026-10-30T12:01:00.000Z',
        count: 4,
        errors: 1,
        p95: 20,
        avg: 0,
        status4xx: 0,
        status5xx: 1,
      },
      expect.objectContaining({ t: '2026-10-30T12:02:00.000Z', count: 0 }),
    ]);
  });
});

describe('windowFromId', () => {
  it('gives a ±1 s window around the time in a UUIDv7', () => {
    const ms = Date.parse('2026-10-30T12:00:00Z');
    const hex = ms.toString(16).padStart(12, '0');
    const id = `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`;
    expect(windowFromId(id)).toEqual({
      from: new Date(ms - 1000),
      to: new Date(ms + 1000),
    });
  });

  it('is null for other ids', () => {
    expect(windowFromId('3b241101-e2bb-4255-8caf-4136c566a962')).toBeNull();
  });
});
