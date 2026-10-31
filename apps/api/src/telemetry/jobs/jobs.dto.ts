import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Primitive, WireError } from '../../ingest/domain/wire.js';
import {
  PercentilesDto,
  TAGS_SCHEMA,
  TraceSpanDto,
  WireErrorDto,
} from '../common/common.dto.js';
import { PageQueryDto, TimeRangeQueryDto } from '../common/query.dto.js';

export const JOB_STATUSES = ['completed', 'failed'] as const;

export class QueuesQueryDto extends TimeRangeQueryDto {}

export class JobsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  queue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: JOB_STATUSES, enumName: 'JobStatus' })
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: 'completed' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  traceId?: string;
}

export class JobStatsDto {
  queue: string;
  name: string;
  count: number;
  failedCount: number;
  /** Ratio 0..1. */
  failureRate: number;
  latency: PercentilesDto;
  avgWaitMs: number;
  lastSeenAt: string;
}

export class JobListItemDto {
  /** UUIDv7 */
  id: string;
  /** Queue job id. */
  jobId: string;
  traceId: string;
  applicationId: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  queue: string;
  name: string;
  @ApiProperty({ enum: JOB_STATUSES, enumName: 'JobStatus', nullable: true })
  status: 'completed' | 'failed' | null;
  durationMs: number;
  @ApiProperty({ type: Number, nullable: true })
  waitMs: number | null;
  @ApiProperty({ type: Number, nullable: true })
  attemptsMade: number | null;
  @ApiProperty({ type: Number, nullable: true })
  maxAttempts: number | null;
  calledAt: string;
}

export class JobDetailDto extends JobListItemDto {
  /** Version the instance reported when it ran the job. */
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  @ApiProperty({ type: String, nullable: true })
  enqueuedAt: string | null;
  @ApiProperty(TAGS_SCHEMA)
  tags: Record<string, Primitive>;
  @ApiProperty({ type: WireErrorDto, nullable: true })
  error: WireError | null;
  @ApiProperty({ type: [TraceSpanDto] })
  trace: TraceSpanDto[];
}

export class JobPageDto {
  @ApiProperty({ type: [JobListItemDto] })
  items: JobListItemDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
