import type { KeysetCursor, Page } from '../../telemetry/common/cursor.js';
import type { ApiKeyDto } from './api-keys.dto.js';

export interface NewApiKey {
  projectId: string;
  applicationId: string;
  name: string;
  keyId: string;
  secretHash: Buffer;
}

/** Port for the API keys of a project. Secrets are only ever stored as hashes. */
export abstract class ApiKeysRepository {
  /** Newest first. */
  abstract list(
    projectId: string,
    filter: { applicationId?: string },
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<ApiKeyDto>>;
  /** Null when the application is not in the project. */
  abstract insert(key: NewApiKey): Promise<ApiKeyDto | null>;
  /** Sets `revoked_at` (idempotent). Null when not found. */
  abstract revoke(projectId: string, id: string): Promise<ApiKeyDto | null>;
  /** Returns the deleted key's public id, or null when not found. */
  abstract delete(projectId: string, id: string): Promise<string | null>;
}
