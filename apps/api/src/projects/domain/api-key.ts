import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const API_KEY_STATUSES = ['active', 'revoked'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

/** Public key id prefix (sent as `x-api-key`). */
export const KEY_ID_PREFIX = 'obs_';
/** Secret prefix (sent as `x-api-secret`), so leaked secrets are easy to recognize. */
export const SECRET_PREFIX = 'obss_';

export interface GeneratedApiKey {
  keyId: string;
  /** Plaintext, returned once to the caller and never stored. */
  secret: string;
  secretHash: Buffer;
}

/**
 * The secret is 32 random bytes, so a fast unsalted SHA-256 is enough: there is nothing
 * to brute-force that a slow KDF would protect.
 */
export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function generateApiKey(): GeneratedApiKey {
  const keyId = KEY_ID_PREFIX + randomBytes(18).toString('base64url');
  const secret = SECRET_PREFIX + randomBytes(32).toString('base64url');
  return { keyId, secret, secretHash: hashSecret(secret) };
}

/** Constant-time check of a presented secret against the stored hash. */
export function secretMatches(secret: string, secretHash: Buffer): boolean {
  const actual = hashSecret(secret);
  return (
    actual.length === secretHash.length && timingSafeEqual(actual, secretHash)
  );
}

export function apiKeyStatus(key: { revokedAt: Date | null }): ApiKeyStatus {
  return key.revokedAt ? 'revoked' : 'active';
}

/** Cheap shape check before touching the database: ids are `obs_` + 24 base64url chars. */
export function looksLikeKeyId(value: string): boolean {
  return /^obs_[A-Za-z0-9_-]{24}$/.test(value);
}
