import { describe, expect, it } from 'vitest';
import { apportion, type UsageCell } from './apportion.js';

const cell = (
  owner: string,
  table: string,
  day: string,
  bytes: number,
): UsageCell => ({ owner, table, day, rows: 1, bytes });

describe('apportion', () => {
  it('splits a day partition by the counted bytes of each owner', () => {
    const result = apportion(
      [
        cell('a', 'requests', '2026-10-30', 100),
        cell('b', 'requests', '2026-10-30', 300),
      ],
      [{ table: 'requests', day: '2026-10-30', bytes: 400 }],
      [{ table: 'requests', day: '2026-10-30', bytes: 1000 }],
    );
    expect(result.map((c) => c.estimatedBytes)).toEqual([250, 750]);
  });

  it('includes owners outside the cells in the day total (other projects)', () => {
    const [only] = apportion(
      [cell('a', 'logs', '2026-10-30', 100)],
      [{ table: 'logs', day: '2026-10-30', bytes: 1000 }],
      [{ table: 'logs', day: '2026-10-30', bytes: 5000 }],
    );
    expect(only.estimatedBytes).toBe(500);
  });

  it('splits a table that is not partitioned over all its days', () => {
    const result = apportion(
      [
        cell('a', 'profiles', '2026-10-29', 100),
        cell('b', 'profiles', '2026-10-30', 200),
      ],
      [
        { table: 'profiles', day: '2026-10-29', bytes: 100 },
        { table: 'profiles', day: '2026-10-30', bytes: 200 },
      ],
      [{ table: 'profiles', day: null, bytes: 900 }],
    );
    expect(result.map((c) => c.estimatedBytes)).toEqual([300, 600]);
  });

  it('estimates 0 without a known size or counted bytes', () => {
    const result = apportion(
      [
        cell('a', 'jobs', '2026-10-30', 100),
        cell('a', 'logs', '2026-10-30', 0),
      ],
      [{ table: 'logs', day: '2026-10-30', bytes: 0 }],
      [{ table: 'logs', day: '2026-10-30', bytes: 4096 }],
    );
    expect(result.map((c) => c.estimatedBytes)).toEqual([0, 0]);
  });

  it('keeps the input cells and rounds to whole bytes', () => {
    const input = cell('a', 'requests', '2026-10-30', 1);
    const [result] = apportion(
      [input],
      [{ table: 'requests', day: '2026-10-30', bytes: 3 }],
      [{ table: 'requests', day: '2026-10-30', bytes: 1000 }],
    );
    expect(result).toEqual({ ...input, estimatedBytes: 333 });
  });
});
