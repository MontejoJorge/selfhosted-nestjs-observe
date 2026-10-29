import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  apiKeyStatus,
  looksLikeKeyId,
  secretMatches,
} from '../domain/api-key.js';

/** How long a key lookup (hit or miss) is trusted before re-reading it. */
const CACHE_TTL_MS = 60_000;
/** Bound on cached entries, so random key ids cannot grow memory without limit. */
const MAX_ENTRIES = 10_000;

interface CachedKey {
  /** null when the key id does not exist */
  key: {
    id: string;
    applicationId: string;
    secretHash: Buffer;
    revokedAt: Date | null;
  } | null;
  fetchedAt: number;
}

/**
 * Resolves ingest credentials (`x-api-key` / `x-api-secret`) to an application id.
 *
 * Lookups are cached in memory for 60 s, so a busy agent does not cost a database round
 * trip per batch. Revoking or deleting a key through this instance evicts it at once;
 * other API instances notice within the TTL.
 */
@Injectable()
export class ApiKeyAuthenticator {
  private readonly cache = new Map<string, CachedKey>();

  constructor(@Inject(KYSELY) private readonly db: Db) {}

  /** Application id for valid, active credentials; null otherwise. */
  async authenticate(
    keyId: string | undefined,
    secret: string | undefined,
  ): Promise<string | null> {
    if (!keyId || !secret || !looksLikeKeyId(keyId)) return null;
    const { key } = await this.lookup(keyId);
    if (!key || !secretMatches(secret, key.secretHash)) return null;
    if (apiKeyStatus(key) !== 'active') return null;
    return key.applicationId;
  }

  /** Drops a key from the cache (after revoke or delete). */
  evict(keyId: string): void {
    this.cache.delete(keyId);
  }

  private async lookup(keyId: string): Promise<CachedKey> {
    const now = Date.now();
    const cached = this.cache.get(keyId);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached;

    const row = await this.db
      .selectFrom('api_keys')
      .select(['id', 'application_id', 'secret_hash', 'revoked_at'])
      .where('key_id', '=', keyId)
      .executeTakeFirst();
    const entry: CachedKey = {
      key: row
        ? {
            id: row.id,
            applicationId: row.application_id,
            secretHash: row.secret_hash,
            revokedAt: row.revoked_at,
          }
        : null,
      fetchedAt: now,
    };
    if (this.cache.size >= MAX_ENTRIES) this.cache.clear();
    this.cache.set(keyId, entry);
    return entry;
  }
}
