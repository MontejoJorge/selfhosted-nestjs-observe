import type { LogItem, LogLevel, Page } from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TimeWindow } from '../common/time-window.js';

export interface LogFilter {
  window: TimeWindow;
  serviceId?: string;
  level?: LogLevel;
  traceId?: string;
  context?: string;
  /** case-insensitive substring of the text */
  q?: string;
}

/** Read port for logs. */
export abstract class LogsRepository {
  abstract list(
    filter: LogFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<LogItem>>;
  abstract findByTraceId(traceId: string): Promise<LogItem[]>;
}
