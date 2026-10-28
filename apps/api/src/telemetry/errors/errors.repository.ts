import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TimeWindow } from '../common/time-window.js';

export interface ErrorFilter {
  window: TimeWindow;
  serviceId?: string;
  source?: 'request' | 'job';
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
    id: string,
    window: TimeWindow,
  ): Promise<ErrorGroupDetail | null>;
}
