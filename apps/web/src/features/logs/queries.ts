import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import type { LogItem, LogLevel } from '@selfhosted-observe/contracts';

export interface LogFilters {
  level?: LogLevel;
  context?: string;
  traceId?: string;
  q?: string;
}

export const logsQueryOptions = (scope: Scope, filters: LogFilters) =>
  pagedQueryOptions<LogItem>(['logs', 'list', scope, filters], '/logs', {
    ...scope,
    ...filters,
  });

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];
