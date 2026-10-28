import type { LogItem, LogLevel, Page } from '@selfhosted-observe/contracts';
import type { KeysetCursor } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';

export interface LogFilter {
  scope: TelemetryScope;
  window: TimeWindow;
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
  abstract findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<LogItem[]>;
}
