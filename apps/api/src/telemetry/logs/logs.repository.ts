import type { LogLevel } from '../../ingest/domain/wire.js';
import type { KeysetCursor, Page } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { LogItemDto } from './logs.dto.js';

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
  ): Promise<Page<LogItemDto>>;
  abstract findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<LogItemDto[]>;
}
