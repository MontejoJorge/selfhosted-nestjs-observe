import { ApiProperty } from '@nestjs/swagger';
import type { Overview } from '@selfhosted-observe/contracts';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PercentilesDto, TimeBucketDto } from '../common/common.dto.js';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export class OverviewQueryDto extends TimeRangeQueryDto {
  /** Scopes the requests block and the timeline to one operation. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  operationId?: string;
}

export class RequestsOverviewDto {
  count: number;
  /** Ratio 0..1. */
  errorRate: number;
  latency: PercentilesDto;
}

export class JobsOverviewDto {
  count: number;
  /** Ratio 0..1. */
  failureRate: number;
  latency: PercentilesDto;
}

export class ErrorsOverviewDto {
  /** Error groups seen in the range. */
  groups: number;
  /** Error occurrences in the range. */
  events: number;
}

export class OverviewDto implements Overview {
  requests: RequestsOverviewDto;
  jobs: JobsOverviewDto;
  errors: ErrorsOverviewDto;
  /** Requests per bucket, gap-filled. */
  @ApiProperty({ type: [TimeBucketDto] })
  timeline: TimeBucketDto[];
}
