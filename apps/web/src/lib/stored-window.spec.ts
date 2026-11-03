import { describe, expect, it } from 'vitest';
import { windowSearch, withStoredWindow } from './stored-window';

const params = (search: string) => new URLSearchParams(search);

describe('windowSearch', () => {
  it('keeps the range of a preset and the bounds of a custom window', () => {
    expect(windowSearch({ range: '24h' }).toString()).toBe('range=24h');
    expect(
      windowSearch({
        range: '1h',
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
      }).toString(),
    ).toBe('from=2026-11-01T00%3A00%3A00Z&to=2026-11-02T00%3A00%3A00Z');
  });
});

describe('withStoredWindow', () => {
  it('adds the stored window to a URL without one, keeping its other params', () => {
    expect(
      withStoredWindow(params('application=a'), 'range=7d')?.toString(),
    ).toBe('application=a&range=7d');
    expect(
      withStoredWindow(
        params(''),
        'from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z',
      )?.toString(),
    ).toBe('from=2026-11-01T00%3A00%3A00Z&to=2026-11-02T00%3A00%3A00Z');
  });

  it('leaves a URL that picks its own window alone', () => {
    expect(withStoredWindow(params('range=1h'), 'range=7d')).toBeNull();
    expect(
      withStoredWindow(params('from=2026-11-01T00:00:00Z'), 'range=7d'),
    ).toBeNull();
  });

  it('restores nothing when nothing, the default or garbage was stored', () => {
    expect(withStoredWindow(params(''), null)).toBeNull();
    expect(withStoredWindow(params(''), 'range=1h')).toBeNull();
    expect(withStoredWindow(params(''), 'range=99y')).toBeNull();
  });
});
