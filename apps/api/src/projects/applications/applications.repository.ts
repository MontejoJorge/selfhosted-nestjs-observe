import type {
  Application,
  ApplicationSummary,
  Page,
} from '@selfhosted-observe/contracts';
import type { TextKeysetCursor } from '../../telemetry/common/cursor.js';
import type { TimeWindow } from '../../telemetry/common/time-window.js';

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
  ): Promise<Page<ApplicationSummary>>;
  abstract findById(projectId: string, id: string): Promise<Application | null>;
  abstract insert(
    projectId: string,
    application: { name: string; tags: string[] },
  ): Promise<Application>;
  abstract update(
    projectId: string,
    id: string,
    patch: ApplicationPatch,
  ): Promise<Application | null>;
  /**
   * Deletes the application and its keys and queues the purge of its telemetry, in one
   * transaction. Returns the deleted key ids, or null when not found.
   */
  abstract delete(
    projectId: string,
    id: string,
  ): Promise<{ keyIds: string[] } | null>;
}
