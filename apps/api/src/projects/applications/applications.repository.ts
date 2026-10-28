import type { Page, TextKeysetCursor } from '../../telemetry/common/cursor.js';
import type { TimeWindow } from '../../telemetry/common/time-window.js';
import type { ApiKeyDto } from '../api-keys/api-keys.dto.js';
import type { NewApiKey } from '../api-keys/api-keys.repository.js';
import type {
  ApplicationDto,
  ApplicationSummaryDto,
} from './applications.dto.js';

export interface ApplicationPatch {
  name?: string;
  tags?: string[];
}

/** Thrown when an application name is already used in the project. */
export class ApplicationNameTakenError extends Error {}

/** Port for the applications of a project. */
export abstract class ApplicationsRepository {
  /** Sorted by name, with request and runtime stats over the window. */
  abstract list(
    projectId: string,
    window: TimeWindow,
    page: { limit: number; cursor: TextKeysetCursor | null },
  ): Promise<Page<ApplicationSummaryDto>>;
  abstract findById(
    projectId: string,
    id: string,
  ): Promise<ApplicationDto | null>;
  /** Inserts the application and its first API key in one transaction. */
  abstract insert(
    projectId: string,
    application: { name: string; tags: string[] },
    initialKey: Omit<NewApiKey, 'projectId' | 'applicationId'>,
  ): Promise<{ application: ApplicationDto; apiKey: ApiKeyDto }>;
  abstract update(
    projectId: string,
    id: string,
    patch: ApplicationPatch,
  ): Promise<ApplicationDto | null>;
  /**
   * Deletes the application and its keys and queues the purge of its telemetry, in one
   * transaction. Returns the deleted key ids, or null when not found.
   */
  abstract delete(
    projectId: string,
    id: string,
  ): Promise<{ keyIds: string[] } | null>;
}
