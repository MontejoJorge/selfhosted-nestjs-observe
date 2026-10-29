import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export const EXECUTION_SOURCES = ['request', 'job'] as const;
export type ExecutionSource = (typeof EXECUTION_SOURCES)[number];

export const MAX_BREAKDOWN_ITEMS = 500;
export const DEFAULT_SLOW_SPANS = 50;
export const MAX_SLOW_SPANS = 100;

export class TimeBreakdownQueryDto extends TimeRangeQueryDto {
  /** Only spans of requests or only spans of jobs. */
  @ApiPropertyOptional({ enum: EXECUTION_SOURCES, enumName: 'ExecutionSource' })
  @IsOptional()
  @IsIn(EXECUTION_SOURCES)
  source?: ExecutionSource;

  /** Only spans of requests to this operation. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  operationId?: string;

  /** Only spans of jobs of this queue. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  queue?: string;

  /** Only spans of jobs with this name (usually with `queue`). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}

export class SlowSpansQueryDto extends TimeBreakdownQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  className: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  methodName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  origin?: string;

  /** Max spans returned (default 50, max 100). */
  @ApiPropertyOptional({ type: 'integer', default: DEFAULT_SLOW_SPANS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SLOW_SPANS)
  limit?: number;
}

/** Time spent in one class method (or outbound call) across the matching executions. */
export class TimeBreakdownItemDto {
  /** Span origin as reported by the agent (`auto`, `manual`, ...). */
  origin: string;
  /** Class, or the kind of outbound call (`http`, `pg`, ...). */
  className: string;
  /** Method, or the outbound call's name (`GET host`, `SELECT table`, ...). */
  methodName: string;
  calls: number;
  /** Spans that recorded an error. */
  errorCount: number;
  /** Sum of the span durations (ms). Nested spans count in their parents too. */
  totalMs: number;
  /** Sum of the self times (ms): duration minus direct children, at least 0. */
  selfMs: number;
  /** selfMs / totalSelfMs, ratio 0..1. */
  share: number;
  /** Mean span duration (ms). */
  avgMs: number;
  /** 95th percentile of the span duration (ms). */
  p95Ms: number;
}

export class TimeBreakdownDto {
  /** Self time of every matching span; the denominator of `share`. */
  totalSelfMs: number;
  /** By selfMs desc, at most 500. */
  @ApiProperty({ type: [TimeBreakdownItemDto] })
  items: TimeBreakdownItemDto[];
}

export class SlowSpanDto {
  /** Request or job id, links to its detail route. */
  executionId: string;
  @ApiProperty({ enum: EXECUTION_SOURCES, enumName: 'ExecutionSource' })
  source: ExecutionSource;
  traceId: string;
  /** operationId for requests, `queue/name` for jobs. */
  operationId: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  durationMs: number;
  /** Duration minus direct children (ms). */
  @ApiProperty({ type: Number, nullable: true })
  selfMs: number | null;
  calledAt: string;
}
