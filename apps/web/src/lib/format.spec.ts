import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCount,
  formatDateTime,
  formatDay,
  formatDuration,
  formatLongDay,
  formatMegabytes,
  formatPercent,
  formatPreciseTime,
  formatRate,
  formatRelative,
  formatShare,
  formatTime,
  shortId,
} from './format';

describe('formatCount', () => {
  it('groups thousands below 10k and goes compact from there', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(9_999)).toBe('9,999');
    expect(formatCount(10_000)).toBe('10K');
    expect(formatCount(1_234_567)).toBe('1.2M');
  });
});

describe('formatRate', () => {
  it('formats 0..1 ratios as percentages', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.0004)).toBe('<0.1%');
    expect(formatRate(0.001)).toBe('0.1%');
    expect(formatRate(0.0512)).toBe('5.1%');
    expect(formatRate(0.25)).toBe('25%');
    expect(formatRate(1)).toBe('100%');
  });
});

describe('formatShare', () => {
  it('never shows 0 for a non-zero share nor 100 for a partial one', () => {
    expect(formatShare(0)).toBe('0');
    expect(formatShare(0.004)).toBe('<1');
    expect(formatShare(0.42)).toBe('42');
    expect(formatShare(0.996)).toBe('99');
    expect(formatShare(1)).toBe('100');
  });
});

describe('formatPercent', () => {
  it('shows a dash for missing values', () => {
    expect(formatPercent(null)).toBe('–');
    expect(formatPercent(undefined)).toBe('–');
    expect(formatPercent(37.25)).toBe('37.3%');
  });
});

describe('formatDuration', () => {
  it.each([
    [null, '–'],
    [undefined, '–'],
    [Number.NaN, '–'],
    [0, '0 ms'],
    [0.123, '0.12 ms'],
    [12.34, '12.3 ms'],
    [250.4, '250 ms'],
    [1_500, '1.50 s'],
    [90_000, '1.5 min'],
    [5_400_000, '1.5 h'],
  ])('formats %s as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([
    [99.96, '100 ms'],
    [999.6, '1.00 s'],
    [59_999, '1.0 min'],
    [3_599_000, '1.0 h'],
  ])(
    'switches unit when rounding reaches the next one: %s as %s',
    (ms, expected) => {
      expect(formatDuration(ms)).toBe(expected);
    },
  );
});

describe('formatMegabytes', () => {
  it('formats MB and switches to GB at 1024 MB', () => {
    expect(formatMegabytes(null)).toBe('–');
    expect(formatMegabytes(4.25)).toBe('4.3 MB');
    expect(formatMegabytes(512)).toBe('512 MB');
    expect(formatMegabytes(1536)).toBe('1.50 GB');
  });
});

describe('formatBytes', () => {
  it('uses binary multiples with 3 significant digits', () => {
    expect(formatBytes(undefined)).toBe('–');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(15.5 * 1024)).toBe('15.5 KB');
    expect(formatBytes(1.93 * 1024 ** 3)).toBe('1.93 GB');
    expect(formatBytes(2 * 1024 ** 5)).toBe('2048 TB');
  });

  it('clamps negative sizes to 0', () => {
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('date formatting', () => {
  // vitest.config.ts pins TZ=UTC
  const iso = '2026-10-29T16:05:09.042Z';

  it('formats UTC days', () => {
    expect(formatDay('2026-10-29')).toBe('Oct 29');
    expect(formatLongDay('2026-10-29')).toBe('Thu, Oct 29, 2026');
  });

  it('formats date-times in 24-hour time', () => {
    expect(formatDateTime(iso)).toBe('Oct 29, 16:05:09');
    expect(formatTime(iso)).toBe('16:05');
    expect(formatPreciseTime(iso)).toBe('16:05:09.042');
  });

  it('formats relative times in the largest fitting unit', () => {
    const now = Date.parse(iso);
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(formatRelative(iso, now)).toBe('now');
    expect(formatRelative(ago(30_000), now)).toBe('30 seconds ago');
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(formatRelative(ago(86_400_000), now)).toBe('yesterday');
    expect(formatRelative(ago(-2 * 86_400_000), now)).toBe('in 2 days');
  });
});

describe('shortId', () => {
  it('truncates long ids only', () => {
    expect(shortId('0192b8c2-1a2b-7c3d')).toBe('0192b8c2');
    expect(shortId('abc')).toBe('abc');
    expect(shortId('abcdef', 4)).toBe('abcd');
  });
});
