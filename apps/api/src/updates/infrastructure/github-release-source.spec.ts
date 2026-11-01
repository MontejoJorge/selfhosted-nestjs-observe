import { describe, expect, it } from 'vitest';
import { parseLatestRelease } from './github-release-source.js';

describe('parseLatestRelease', () => {
  it('reads the tag, page and publish date', () => {
    expect(
      parseLatestRelease({
        tag_name: 'v1.1.0',
        html_url: 'https://github.com/o/r/releases/tag/v1.1.0',
        published_at: '2026-11-01T10:00:00Z',
        body: 'notes',
      }),
    ).toEqual({
      version: 'v1.1.0',
      url: 'https://github.com/o/r/releases/tag/v1.1.0',
      publishedAt: new Date('2026-11-01T10:00:00Z'),
    });
  });

  it('leaves out a missing or invalid publish date', () => {
    const base = { tag_name: 'v1.1.0', html_url: 'https://x.test' };
    expect(parseLatestRelease(base).publishedAt).toBeNull();
    expect(
      parseLatestRelease({ ...base, published_at: 'soon' }).publishedAt,
    ).toBeNull();
  });

  it.each([null, 'text', {}, { tag_name: 'v1.0.0' }, { html_url: 'x' }])(
    'rejects %j',
    (body) => {
      expect(() => parseLatestRelease(body)).toThrow(/not a release/);
    },
  );
});
