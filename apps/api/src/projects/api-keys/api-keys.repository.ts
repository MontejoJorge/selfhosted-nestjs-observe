import type { ApiKey, Page } from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../../telemetry/common/cursor.js';

export interface NewApiKey {
  projectId: string;
  applicationId: string;
  name: string;
  keyId: string;
  secretHash: Buffer;
  expiresAt: Date | null;
}

/** Port for the API keys of a project. Secrets are only ever stored as hashes. */
export abstract class ApiKeysRepository {
  /** Newest first. */
  abstract list(
    projectId: string,
    filter: { applicationId?: string },
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<ApiKey>>;
  /** Null when the application is not in the project. */
  abstract insert(key: NewApiKey): Promise<ApiKey | null>;
  /** Sets `revoked_at` (idempotent). Null when not found. */
  abstract revoke(projectId: string, id: string): Promise<ApiKey | null>;
  /** Returns the deleted key's public id, or null when not found. */
  abstract delete(projectId: string, id: string): Promise<string | null>;
}
