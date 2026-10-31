import { describe, expect, it } from 'vitest';
import { paths } from './paths';

describe('paths', () => {
  it('builds project pages', () => {
    expect(paths.projects).toBe('/projects');
    expect(paths.project('shop')).toBe('/projects/shop');
    expect(paths.requests('shop')).toBe('/projects/shop/requests');
    expect(paths.operation('shop')).toBe('/projects/shop/requests/details');
    expect(paths.projectStorage('shop')).toBe(
      '/projects/shop/settings/storage',
    );
  });

  it('encodes the project and ids so they stay one path segment', () => {
    expect(paths.project('a/b c')).toBe('/projects/a%2Fb%20c');
    expect(paths.user('shop', 'user@example.com/1')).toBe(
      '/projects/shop/users/user%40example.com%2F1',
    );
    expect(paths.trace('shop', 'abc?def#x')).toBe(
      '/projects/shop/traces/abc%3Fdef%23x',
    );
    expect(paths.request('shop', '0192b8c2-1a2b-7c3d-8e4f-123456789abc')).toBe(
      '/projects/shop/requests/0192b8c2-1a2b-7c3d-8e4f-123456789abc',
    );
  });

  it('round-trips ids through the router param decoding', () => {
    const userId = 'ünï/cødé %20';
    const segment = paths.user('p', userId).split('/').at(-1)!;
    expect(decodeURIComponent(segment)).toBe(userId);
  });
});
