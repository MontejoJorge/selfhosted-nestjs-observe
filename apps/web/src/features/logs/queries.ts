import { api } from '@/lib/api/client';
import type { LogLevel } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';

export interface LogFilters {
  level?: LogLevel;
  context?: string;
  traceId?: string;
  q?: string;
}

export const logsQueryOptions = (scope: Scope, filters: LogFilters) =>
  pagedQueryOptions(['logs', 'list', scope, filters], (page, signal) =>
    api.logs.listLogs({ ...scope, ...filters, ...page }, { signal }),
  );

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];
