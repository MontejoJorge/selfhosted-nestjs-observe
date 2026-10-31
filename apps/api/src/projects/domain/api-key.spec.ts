import { describe, expect, it } from 'vitest';
import {
  apiKeyStatus,
  generateApiKey,
  hashSecret,
  KEY_ID_PREFIX,
  looksLikeKeyId,
  SECRET_PREFIX,
  secretMatches,
} from './api-key.js';

describe('generateApiKey', () => {
  it('generates prefixed ids and secrets and stores only a SHA-256 hash', () => {
    const key = generateApiKey();
    expect(key.keyId.startsWith(KEY_ID_PREFIX)).toBe(true);
    expect(key.secret.startsWith(SECRET_PREFIX)).toBe(true);
    // 32 random bytes as base64url
    expect(key.secret).toHaveLength(SECRET_PREFIX.length + 43);
    expect(key.secretHash).toHaveLength(32);
    expect(key.secretHash.equals(hashSecret(key.secret))).toBe(true);
  });

  it('generates ids the authenticator recognizes', () => {
    for (let i = 0; i < 20; i++)
      expect(looksLikeKeyId(generateApiKey().keyId)).toBe(true);
  });

  it('never repeats', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.keyId).not.toBe(b.keyId);
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('secretMatches', () => {
  const { secret, secretHash } = generateApiKey();

  it('accepts the secret and rejects anything else', () => {
    expect(secretMatches(secret, secretHash)).toBe(true);
    expect(secretMatches(secret + 'x', secretHash)).toBe(false);
    expect(secretMatches('', secretHash)).toBe(false);
  });

  it('rejects a stored hash of the wrong length instead of throwing', () => {
    expect(secretMatches(secret, Buffer.alloc(16))).toBe(false);
  });
});

describe('looksLikeKeyId', () => {
  it('requires the prefix and exactly 24 base64url characters', () => {
    expect(looksLikeKeyId('obs_' + 'A'.repeat(24))).toBe(true);
    expect(looksLikeKeyId('obs_' + 'a-_9'.repeat(6))).toBe(true);
    expect(looksLikeKeyId('obs_' + 'A'.repeat(23))).toBe(false);
    expect(looksLikeKeyId('obs_' + 'A'.repeat(25))).toBe(false);
    expect(looksLikeKeyId('obss_' + 'A'.repeat(24))).toBe(false);
    expect(looksLikeKeyId('obs_' + 'A'.repeat(23) + '=')).toBe(false);
  });
});

describe('apiKeyStatus', () => {
  it('is revoked once revokedAt is set', () => {
    expect(apiKeyStatus({ revokedAt: null })).toBe('active');
    expect(apiKeyStatus({ revokedAt: new Date() })).toBe('revoked');
  });
});
