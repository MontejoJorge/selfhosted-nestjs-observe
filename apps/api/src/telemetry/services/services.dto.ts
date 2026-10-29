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

export const DEFAULT_SLOW_SPANS = 50;
export const MAX_SLOW_SPANS = 100;

export class ServicesQueryDto extends TimeRangeQueryDto {
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

export class SlowSpansQueryDto extends ServicesQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  className: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  methodName: string;

  /** Max spans returned (default 50, max 100). */
  @ApiPropertyOptional({ type: 'integer', default: DEFAULT_SLOW_SPANS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SLOW_SPANS)
  limit?: number;
}

/** Time spent in one method of a class across the matching executions. */
export class ServiceMethodDto {
  methodName: string;
  calls: number;
  /** Spans that recorded an error. */
  errorCount: number;
  /** Sum of the span durations (ms): everything awaited further down included. */
  totalMs: number;
  /** Sum of the own times (ms): duration minus direct children, at least 0. */
  selfMs: number;
}

/**
 * Time spent in one class across the matching executions. Outbound calls (`http`,
 * `pg`, ...) are left out.
 */
export class ServiceDto {
  className: string;
  calls: number;
  errorCount: number;
  totalMs: number;
  selfMs: number;
  /** selfMs / totalSelfMs, ratio 0..1. */
  share: number;
  /** By selfMs desc. */
  @ApiProperty({ type: [ServiceMethodDto] })
  methods: ServiceMethodDto[];
}

export class ServicesDto {
  /** Own time of every listed class; the denominator of `share`. */
  totalSelfMs: number;
  /** By selfMs desc. */
  @ApiProperty({ type: [ServiceDto] })
  services: ServiceDto[];
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
