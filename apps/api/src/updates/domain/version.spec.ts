import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer, parseVersion } from './version.js';

describe('parseVersion', () => {
  it('reads a version and a v-prefixed tag', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
    expect(parseVersion('v10.0.1-rc.2+build.5')).toEqual({
      major: 10,
      minor: 0,
      patch: 1,
      prerelease: ['rc', '2'],
    });
  });

  it('rejects what is not semver', () => {
    for (const text of ['', '1.2', '1.2.3.4', 'latest', '01.2.3', 'v'])
      expect(parseVersion(text)).toBeNull();
  });
});

describe('compareVersions', () => {
  const sorted = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.1',
    '1.2.0',
    '1.10.0',
    '2.0.0',
  ];

  it('follows semver precedence', () => {
    const versions = sorted.map((v) => parseVersion(v)!);
    for (let i = 0; i < versions.length - 1; i++) {
      expect(compareVersions(versions[i], versions[i + 1])).toBeLessThan(0);
      expect(compareVersions(versions[i + 1], versions[i])).toBeGreaterThan(0);
    }
  });

  it('ignores the v prefix and build metadata', () => {
    expect(
      compareVersions(parseVersion('v1.0.0')!, parseVersion('1.0.0+abc')!),
    ).toBe(0);
  });
});

describe('isNewer', () => {
  it('is true only for a newer latest version', () => {
    expect(isNewer('v1.1.0', '1.0.0')).toBe(true);
    expect(isNewer('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('v0.9.0', '1.0.0')).toBe(false);
  });

  it('is false when either side is not semver', () => {
    expect(isNewer('nightly', '1.0.0')).toBe(false);
    expect(isNewer('v2.0.0', 'dev')).toBe(false);
  });
});
