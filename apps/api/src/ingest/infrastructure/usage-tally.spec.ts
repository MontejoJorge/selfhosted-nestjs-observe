import { describe, expect, it } from 'vitest';
import { estimateRowBytes, UsageTally } from './usage-tally.js';

const UUID = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';

describe('estimateRowBytes', () => {
  it('counts the tuple overhead plus each non-null value', () => {
    expect(estimateRowBytes({})).toBe(24);
    expect(
      estimateRowBytes({
        missing: null,
        undefinedValue: undefined,
        id: UUID, // 16
        text: 'abc', // 3 + 1 header
        count: 5, // 8
        at: new Date(), // 8
        flag: true, // 1
        json: { x: 1 }, // '{"x":1}' = 7 + 4
      }),
    ).toBe(24 + 16 + 4 + 8 + 8 + 1 + 11);
  });

  it('uses the long varlena header from 127 bytes and counts UTF-8 bytes', () => {
    expect(estimateRowBytes({ s: 'x'.repeat(126) })).toBe(24 + 126 + 1);
    expect(estimateRowBytes({ s: 'x'.repeat(127) })).toBe(24 + 127 + 4);
    expect(estimateRowBytes({ s: 'é' })).toBe(24 + 2 + 1);
  });
});

describe('UsageTally', () => {
  it('counts rows and bytes per UTC day and table, sorted by primary key', () => {
    const tally = new UsageTally();
    tally.add('requests', [
      { called_at: new Date('2026-10-30T23:59:59Z'), a: 1 },
      { called_at: new Date('2026-10-31T00:00:00Z'), a: 1 },
      { called_at: new Date('2026-10-30T10:00:00Z'), a: 1 },
    ]);
    tally.add('logs', [{ timestamp: new Date('2026-10-30T10:00:00Z') }]);

    const rows = tally.rowsOf(UUID);
    expect(rows.map((r) => [r.day, r.table_name, r.rows])).toEqual([
      ['2026-10-30', 'logs', 1],
      ['2026-10-30', 'requests', 2],
      ['2026-10-31', 'requests', 1],
    ]);
    expect(rows.every((r) => r.application_id === UUID)).toBe(true);
    // two rows of (overhead + date + number)
    expect(rows[1].bytes).toBe(2 * (24 + 8 + 8));
  });

  it('is empty when nothing was added', () => {
    expect(new UsageTally().rowsOf(UUID)).toEqual([]);
  });
});
