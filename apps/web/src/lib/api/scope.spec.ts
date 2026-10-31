import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RANGE,
  MAX_WINDOW_MS,
  pickWindow,
  scopeFromParams,
  TIME_RANGE_INFO,
  TIME_RANGES,
  windowFromParams,
} from './scope';

const NOW = new Date('2026-10-30T12:00:00Z');
const params = (query: string) => new URLSearchParams(query);

describe('TIME_RANGE_INFO', () => {
  it('lists the presets shortest first', () => {
    const lengths = TIME_RANGES.map((range) => TIME_RANGE_INFO[range].ms);
    expect(lengths).toEqual(lengths.toSorted((a, b) => a - b));
    expect(TIME_RANGES[0]).toBe(DEFAULT_RANGE);
  });

  it('caps custom windows at 31 days like the API', () => {
    expect(MAX_WINDOW_MS).toBe(31 * 86_400_000);
  });
});

describe('scopeFromParams', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the whole project over the last hour', () => {
    expect(scopeFromParams('shop', params(''))).toEqual({
      project: 'shop',
      application: undefined,
      range: '1h',
    });
  });

  it('reads the application and a preset', () => {
    expect(
      scopeFromParams('shop', params('application=app-1&range=7d&q=x')),
    ).toEqual({ project: 'shop', application: 'app-1', range: '7d' });
  });

  it('falls back to the default for an unknown preset', () => {
    expect(scopeFromParams('shop', params('range=2y')).range).toBe('1h');
  });

  it('reads a custom window and normalizes the ignored range', () => {
    expect(
      scopeFromParams(
        'shop',
        params('range=7d&from=2026-10-29T00:00:00Z&to=2026-10-29T06:00:00Z'),
      ),
    ).toEqual({
      project: 'shop',
      application: undefined,
      range: '1h',
      from: '2026-10-29T00:00:00Z',
      to: '2026-10-29T06:00:00Z',
    });
  });

  it('runs a window with only `from` until now', () => {
    expect(windowFromParams(params('from=2026-10-30T10:00:00Z'))).toEqual({
      range: '1h',
      from: '2026-10-30T10:00:00Z',
    });
  });

  it.each([
    ['`to` alone', 'range=24h&to=2026-10-29T00:00:00Z'],
    [
      'from after to',
      'range=24h&from=2026-10-29T06:00:00Z&to=2026-10-29T00:00:00Z',
    ],
    [
      'from equal to to',
      'range=24h&from=2026-10-29T06:00:00Z&to=2026-10-29T06:00:00Z',
    ],
    [
      'more than 31 days',
      'range=24h&from=2026-09-01T00:00:00Z&to=2026-10-29T00:00:00Z',
    ],
    ['`from` in the future', 'range=24h&from=2026-10-31T00:00:00Z'],
    ['a date without a zone', 'range=24h&from=2026-10-29T00:00:00'],
    ['a plain date', 'range=24h&from=2026-10-29'],
  ])('falls back to the preset for %s', (_, query) => {
    expect(windowFromParams(params(query))).toEqual({ range: '24h' });
  });

  it('accepts offsets other than Z', () => {
    expect(
      windowFromParams(
        params('from=2026-10-29T00:00:00%2B02:00&to=2026-10-29T06:00:00-05:00'),
      ),
    ).toMatchObject({
      from: '2026-10-29T00:00:00+02:00',
      to: '2026-10-29T06:00:00-05:00',
    });
  });
});

describe('pickWindow', () => {
  it('keeps only the window fields that are set', () => {
    expect(pickWindow({ range: '1h' })).toEqual({ range: '1h' });
    expect(pickWindow({ range: '1h', from: 'a', to: undefined })).toStrictEqual(
      { range: '1h', from: 'a' },
    );
    expect(
      pickWindow({
        range: '1h',
        from: 'a',
        to: 'b',
        project: 'p',
      } as Parameters<typeof pickWindow>[0]),
    ).toStrictEqual({ range: '1h', from: 'a', to: 'b' });
  });
});
