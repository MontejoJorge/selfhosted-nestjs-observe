import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type {
  ExecutionSource,
  SlowSpanDto,
  TimeBreakdownDto,
} from './time-breakdown.dto.js';

export interface TimeBreakdownFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  source?: ExecutionSource;
  operationId?: string;
  queue?: string;
  name?: string;
}

export interface SlowSpansFilter extends TimeBreakdownFilter {
  className: string;
  methodName: string;
  origin?: string;
  limit: number;
}

/** Read port for where execution time is spent, by span class and method. */
export abstract class TimeBreakdownRepository {
  abstract breakdown(filter: TimeBreakdownFilter): Promise<TimeBreakdownDto>;
  abstract slowestSpans(filter: SlowSpansFilter): Promise<SlowSpanDto[]>;
}
