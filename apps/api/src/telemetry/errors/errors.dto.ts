import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import { IsIn, IsOptional } from 'class-validator';
import { TimeBucketDto } from '../common/common.dto.js';
import { PageQueryDto, TimeRangeQueryDto } from '../common/query.dto.js';

export const ERROR_SOURCES = ['request', 'job'] as const;

export class ErrorsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ERROR_SOURCES, enumName: 'ErrorSource' })
  @IsOptional()
  @IsIn(ERROR_SOURCES)
  source?: 'request' | 'job';
}

/** The time range limits the timeline and occurrences; default 1h. */
export class ErrorDetailQueryDto extends TimeRangeQueryDto {}

export class ErrorGroupDto implements ErrorGroup {
  id: string;
  fingerprint: string;
  /** Error groups are per application. */
  applicationId: string;
  /** Instance (serviceId) of the most recent occurrence. */
  serviceId: string;
  @ApiProperty({ type: String, nullable: true })
  errorClass: string | null;
  message: string;
  @ApiProperty({ enum: ERROR_SOURCES, enumName: 'ErrorSource' })
  source: 'request' | 'job';
  /** operationId or `queue/name` where it happens most. */
  @ApiProperty({ type: String, nullable: true })
  culprit: string | null;
  /** All-time count (within retention). */
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export class ErrorOccurrenceDto {
  /** Request or job id, links to its detail route. */
  executionId: string;
  @ApiProperty({ enum: ERROR_SOURCES, enumName: 'ErrorSource' })
  source: 'request' | 'job';
  traceId: string;
  applicationId: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  occurredAt: string;
}

export class ErrorGroupDetailDto
  extends ErrorGroupDto
  implements ErrorGroupDetail
{
  @ApiProperty({ type: String, nullable: true })
  stack: string | null;
  @ApiProperty({ type: [TimeBucketDto] })
  timeline: TimeBucketDto[];
  /** Most recent occurrences in the time range. */
  @ApiProperty({ type: [ErrorOccurrenceDto] })
  occurrences: ErrorOccurrenceDto[];
}

export class ErrorGroupPageDto implements Page<ErrorGroup> {
  @ApiProperty({ type: [ErrorGroupDto] })
  items: ErrorGroupDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
