import type { Page } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { ReleaseWindow } from './release-comparison.js';
import type {
  ReleaseDetailDto,
  ReleaseMarkerDto,
  ReleaseSummaryDto,
} from './releases.dto.js';

/** Keyset position in the release list: boundary, then application and version. */
export interface ReleaseCursor {
  at: Date;
  applicationId: string;
  version: string;
}

export interface ReleaseListFilter {
  scope: TelemetryScope;
  /** releases whose boundary falls in it */
  range: TimeWindow;
  window: ReleaseWindow;
  limit: number;
  cursor: ReleaseCursor | null;
}

/** Read port for releases (ADR 0006). */
export abstract class ReleasesRepository {
  abstract list(filter: ReleaseListFilter): Promise<Page<ReleaseSummaryDto>>;

  /** Release boundaries in the range, or one instance's version switches (`scope.instance`). */
  abstract markers(
    scope: TelemetryScope,
    range: TimeWindow,
  ): Promise<ReleaseMarkerDto[]>;

  /** Applications of the scope that reported `version`. */
  abstract applicationsWith(
    scope: TelemetryScope,
    version: string,
  ): Promise<string[]>;

  /** Null when the application never reported the version. */
  abstract detail(
    applicationId: string,
    version: string,
    window: ReleaseWindow,
  ): Promise<ReleaseDetailDto | null>;
}
