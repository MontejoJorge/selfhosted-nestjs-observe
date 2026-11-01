import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GITHUB_REPOSITORIES,
  GithubReleaseSource,
  parseLatestRelease,
  releasesPageOf,
} from './github-release-source.js';

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

describe('releasesPageOf', () => {
  it("gives a tag's releases page", () => {
    expect(releasesPageOf('https://github.com/o/r/releases/tag/v1.1.0')).toBe(
      'https://github.com/o/r/releases',
    );
    expect(releasesPageOf('https://example.test/x')).toBeNull();
  });
});

describe('GithubReleaseSource', () => {
  const [current, unofficial] = GITHUB_REPOSITORIES;
  const release = (repository: string) => ({
    tag_name: 'v1.1.0',
    html_url: `https://github.com/${repository}/releases/tag/v1.1.0`,
  });

  /** Answers each repository's `releases/latest` with the given status and body. */
  function stubGitHub(answers: Record<string, [number, unknown?]>) {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      const repository = /repos\/(.+)\/releases\/latest$/.exec(url)![1];
      asked.push(repository);
      const [status, body] = answers[repository] ?? [404];
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
        }),
      );
    });
    return asked;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the current repository first', async () => {
    const asked = stubGitHub({ [current]: [200, release(current)] });
    const source = new GithubReleaseSource('1.0.0');
    const latest = await source.latest();
    expect(latest?.version).toBe('v1.1.0');
    expect(asked).toEqual([current]);
    expect(source.releasesUrl(latest)).toBe(
      `https://github.com/${current}/releases`,
    );
  });

  it('falls back to the unofficial repository on a 404', async () => {
    const asked = stubGitHub({ [unofficial]: [200, release(unofficial)] });
    const source = new GithubReleaseSource('1.0.0');
    const latest = await source.latest();
    expect(asked).toEqual([current, unofficial]);
    expect(latest?.url).toContain(unofficial);
    expect(source.releasesUrl(latest)).toBe(
      `https://github.com/${unofficial}/releases`,
    );
  });

  it('finds nothing when both answer 404', async () => {
    stubGitHub({});
    const source = new GithubReleaseSource('1.0.0');
    expect(await source.latest()).toBeNull();
    expect(source.releasesUrl(null)).toBe(
      `https://github.com/${current}/releases`,
    );
  });

  it('reports other errors without trying the next repository', async () => {
    const asked = stubGitHub({ [current]: [503] });
    await expect(new GithubReleaseSource('1.0.0').latest()).rejects.toThrow(
      /GitHub answered 503/,
    );
    expect(asked).toEqual([current]);
  });
});
