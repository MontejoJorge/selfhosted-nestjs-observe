import { describe, expect, it } from 'vitest';
import { releaseKey, shortVersion } from './release-math';

describe('shortVersion', () => {
  it('shortens commit hashes to 7 characters', () => {
    expect(shortVersion('3f9c2a1b7d4e')).toBe('3f9c2a1');
    expect(shortVersion('3F9C2A1B7D4E8F0A1B2C3D4E5F6A7B8C9D0E1F2A')).toBe(
      '3F9C2A1',
    );
  });

  it('keeps semver, short hex and other versions as reported', () => {
    expect(shortVersion('1.4.0')).toBe('1.4.0');
    expect(shortVersion('abc1234')).toBe('abc1234');
    expect(shortVersion('release-3f9c2a1b7d4e')).toBe('release-3f9c2a1b7d4e');
  });
});

describe('releaseKey', () => {
  it('identifies one version of one application', () => {
    expect(releaseKey({ applicationId: 'app', version: '1.0' })).toBe(
      'app/1.0',
    );
  });
});
