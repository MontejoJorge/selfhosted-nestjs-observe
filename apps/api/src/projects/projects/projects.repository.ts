import type { Page, TextKeysetCursor } from '../../telemetry/common/cursor.js';
import type { TimeWindow } from '../../telemetry/common/time-window.js';
import type { ProjectDto, ProjectSummaryDto } from './projects.dto.js';

export interface NewProject {
  slug: string;
  name: string;
  description: string | null;
}

export interface ProjectPatch {
  name?: string;
  description?: string | null;
}

/** Thrown by `insert` when the slug is already taken (a concurrent create won the race). */
export class SlugTakenError extends Error {}

/** Port for projects. */
export abstract class ProjectsRepository {
  /** By id (when `ref` is a UUID) or slug. */
  abstract findByRef(ref: string): Promise<ProjectDto | null>;
  /** Sorted by name, with request activity over the window. */
  abstract list(
    window: TimeWindow,
    page: { limit: number; cursor: TextKeysetCursor | null },
  ): Promise<Page<ProjectSummaryDto>>;
  /** Slugs equal to `base` or `base-<n>`. */
  abstract slugsLike(base: string): Promise<Set<string>>;
  abstract insert(project: NewProject): Promise<ProjectDto>;
  abstract update(id: string, patch: ProjectPatch): Promise<ProjectDto | null>;
  /**
   * Deletes the project with its applications and keys, and queues the purge of their
   * telemetry, in one transaction. Returns the deleted key ids, or null when not found.
   */
  abstract delete(id: string): Promise<{ keyIds: string[] } | null>;
}
