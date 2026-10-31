import { describe, expect, it } from 'vitest';
import {
  isCustomWindow,
  isFixedWindow,
  windowBounds,
  windowLabel,
  windowMs,
  windowPhrase,
} from './time-window';

const NOW = Date.parse('2026-10-30T12:00:00Z');

describe('window kinds', () => {
  it('tells presets, open custom windows and fixed windows apart', () => {
    expect(isCustomWindow({ range: '1h' })).toBe(false);
    expect(isFixedWindow({ range: '1h' })).toBe(false);
    const open = { range: '1h' as const, from: '2026-10-30T10:00:00Z' };
    expect(isCustomWindow(open)).toBe(true);
    expect(isFixedWindow(open)).toBe(false);
    const fixed = { ...open, to: '2026-10-30T11:00:00Z' };
    expect(isFixedWindow(fixed)).toBe(true);
  });
});

describe('windowBounds and windowMs', () => {
  it('ends presets now', () => {
    expect(windowBounds({ range: '24h' }, NOW)).toEqual({
      from: NOW - 86_400_000,
      to: NOW,
    });
    expect(windowMs({ range: '7d' }, NOW)).toBe(7 * 86_400_000);
  });

  it('ends an open custom window now and a fixed one at `to`', () => {
    expect(
      windowBounds({ range: '1h', from: '2026-10-30T10:00:00Z' }, NOW),
    ).toEqual({ from: Date.parse('2026-10-30T10:00:00Z'), to: NOW });
    expect(
      windowMs(
        {
          range: '1h',
          from: '2026-10-30T10:00:00Z',
          to: '2026-10-30T10:30:00+00:00',
        },
        NOW,
      ),
    ).toBe(30 * 60_000);
  });
});

describe('labels (TZ=UTC)', () => {
  it('uses the preset label', () => {
    expect(windowLabel({ range: '24h' })).toBe('Last 24 hours');
    expect(windowPhrase({ range: '3d' })).toBe('last 3 days');
  });

  it('describes custom windows', () => {
    expect(
      windowLabel({
        range: '1h',
        from: '2026-10-28T06:30:00Z',
        to: '2026-10-30T12:00:00Z',
      }),
    ).toBe('Oct 28 06:30 → Oct 30 12:00');
    expect(windowLabel({ range: '1h', from: '2026-10-28T06:30:00Z' })).toBe(
      'Oct 28 06:30 → now',
    );
  });

  it('shortens phrases for windows within one day', () => {
    expect(
      windowPhrase({
        range: '1h',
        from: '2026-10-30T06:30:00Z',
        to: '2026-10-30T12:00:00Z',
      }),
    ).toBe('Oct 30 06:30 → 12:00');
    expect(
      windowPhrase({
        range: '1h',
        from: '2026-10-28T06:30:00Z',
        to: '2026-10-30T12:00:00Z',
      }),
    ).toBe('Oct 28 → Oct 30');
    expect(windowPhrase({ range: '1h', from: '2026-10-28T06:30:00Z' })).toBe(
      'since Oct 28 06:30',
    );
  });
});
