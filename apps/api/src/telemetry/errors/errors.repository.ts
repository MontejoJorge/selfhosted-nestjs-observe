import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';

export interface ErrorFilter {
  /** With `scope.instance`, only groups with an occurrence from that instance in the window. */
  scope: TelemetryScope;
  window: TimeWindow;
  source?: 'request' | 'job';
  /** case-insensitive substring of the message or error class */
  q?: string;
}

/** Read port for error groups and their occurrences. */
export abstract class ErrorsRepository {
  /** Groups active in the window (seen at least once within it), most recent first. */
  abstract list(
    filter: ErrorFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<ErrorGroup>>;
  /** Group with timeline and recent occurrences restricted to the window. */
  abstract findById(
    scope: TelemetryScope,
    id: string,
    window: TimeWindow,
  ): Promise<ErrorGroupDetail | null>;
}
