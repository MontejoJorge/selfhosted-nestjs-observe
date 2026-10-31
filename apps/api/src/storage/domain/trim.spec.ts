import { describe, expect, it } from 'vitest';
import { InvalidTrimError, trimCutoffDay } from './trim.js';

describe('trimCutoffDay', () => {
  it('keeps today and the keepDays days before it (UTC)', () => {
    expect(trimCutoffDay(new Date('2026-10-31T23:59:59Z'), 7, 14)).toBe(
      '2026-10-24',
    );
    expect(trimCutoffDay(new Date('2026-10-31T00:00:00Z'), 1, 14)).toBe(
      '2026-10-30',
    );
  });

  it('crosses month and year boundaries', () => {
    expect(trimCutoffDay(new Date('2026-01-03T10:00:00Z'), 5, 14)).toBe(
      '2025-12-29',
    );
  });

  it('accepts 1 to retention - 1 days', () => {
    expect(() => trimCutoffDay(new Date(), 13, 14)).not.toThrow();
    for (const keepDays of [0, -1, 14, 15, 2.5, Number.NaN])
      expect(() => trimCutoffDay(new Date(), keepDays, 14)).toThrow(
        InvalidTrimError,
      );
  });

  it('names the allowed range in the error', () => {
    expect(() => trimCutoffDay(new Date(), 30, 14)).toThrow(
      'keepDays must be an integer from 1 to 13 (RETENTION_DAYS is 14)',
    );
  });
});
