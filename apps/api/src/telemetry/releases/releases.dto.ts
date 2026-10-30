import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RangeQueryDto,
  ScopeQueryDto,
  TimeRangeQueryDto,
} from '../common/query.dto.js';
import { ERROR_SOURCES } from '../errors/errors.dto.js';
import {
  RELEASE_SIGNALS,
  RELEASE_VERDICTS,
  RELEASE_WINDOWS,
  type ReleaseSignal,
  type ReleaseVerdict,
  type ReleaseWindow,
} from './release-comparison.js';

export const DEFAULT_RELEASE_PAGE_SIZE = 20;
export const MAX_RELEASE_PAGE_SIZE = 100;
export const MAX_VERSION_LENGTH = 200;

/** Width of the before and after windows compared around a release boundary. */
export class ReleaseWindowQueryDto {
  /** Default `30m`. */
  @ApiPropertyOptional({ enum: RELEASE_WINDOWS, enumName: 'ReleaseWindow' })
  @IsOptional()
  @IsIn(RELEASE_WINDOWS)
  window?: ReleaseWindow;
}

/**
 * Releases whose boundary falls in the range (`range` defaults to `7d` here), newest
 * first, keyset-paginated.
 */
export class ReleasesQueryDto extends IntersectionType(
  ScopeQueryDto,
  RangeQueryDto,
  ReleaseWindowQueryDto,
) {
  /** Page size (default 20, max 100: every row runs a comparison). */
  @ApiPropertyOptional({ type: 'integer', default: DEFAULT_RELEASE_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RELEASE_PAGE_SIZE)
  limit?: number;

  /** Opaque cursor: pass `nextCursor` from the previous page. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;
}

/**
 * Scope and range of a timeline. Without `instance`: one marker per release boundary.
 * With `instance`: one per version that instance started reporting.
 */
export class ReleaseMarkersQueryDto extends TimeRangeQueryDto {}

export class ReleaseDetailQueryDto extends IntersectionType(
  ScopeQueryDto,
  ReleaseWindowQueryDto,
) {}

export class TimeSpanDto {
  /** Inclusive start (ISO). */
  from: string;
  /** Exclusive end (ISO). */
  to: string;
}

/** Executions of one side of a comparison. For jobs, `errors` are failed runs. */
export class ExecutionStatsDto {
  count: number;
  errors: number;
  /** Ratio 0..1. */
  errorRate: number;
  /** Mean duration (ms). */
  avgMs: number;
  /** From the rollups' latency histograms (ms). */
  p95Ms: number;
}

export class ComparisonDto {
  before: ExecutionStatsDto;
  after: ExecutionStatsDto;
  @ApiProperty({ enum: RELEASE_VERDICTS, enumName: 'ReleaseVerdict' })
  verdict: ReleaseVerdict;
  /** Thresholds crossed (`error_rate_*` is the failure rate for jobs). */
  @ApiProperty({
    enum: RELEASE_SIGNALS,
    enumName: 'ReleaseSignal',
    isArray: true,
  })
  signals: ReleaseSignal[];
}

/**
 * One release: a version of one application. Its boundary (`firstSeenAt`) is the first
 * time any instance of the application reported the version; a rollback and redeploy
 * of the same version keeps the original boundary.
 */
export class ReleaseSummaryDto {
  applicationId: string;
  applicationName: string;
  version: string;
  /** The release boundary: earliest first sighting of the version across instances. */
  firstSeenAt: string;
  /** Latest sighting across instances. */
  lastSeenAt: string;
  /** Version of the application with the latest boundary before this one. */
  @ApiProperty({ type: String, nullable: true })
  previousVersion: string | null;
  /** Instances that ever reported the version. */
  instanceCount: number;
  /** Instances whose latest version this is and that reported in the last 5 minutes. */
  activeInstances: number;
  @ApiProperty({ enum: RELEASE_WINDOWS, enumName: 'ReleaseWindow' })
  window: ReleaseWindow;
  /** Whole minutes before the boundary minute. */
  before: TimeSpanDto;
  /** Whole minutes after the boundary minute (`to` may be in the future). */
  after: TimeSpanDto;
  /** False while the after window has not fully elapsed. */
  complete: boolean;
  /** Every request of the application (not only the new version's) on each side. */
  requests: ComparisonDto;
  /** Every job run of the application on each side. */
  jobs: ComparisonDto;
  /** Worst verdict of `requests` and `jobs` among those with enough data. */
  @ApiProperty({ enum: RELEASE_VERDICTS, enumName: 'ReleaseVerdict' })
  verdict: ReleaseVerdict;
}

export class ReleasePageDto {
  @ApiProperty({ type: [ReleaseSummaryDto] })
  items: ReleaseSummaryDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

/** A vertical line on a timeline. */
export class ReleaseMarkerDto {
  applicationId: string;
  version: string;
  /** Release boundary, or the instance's switch time when `instance` was given. */
  at: string;
  /** The instance, when the markers were asked for one. */
  @ApiProperty({ type: String, nullable: true })
  serviceId: string | null;
}

/** Before and after of one operation (requests) or job (`queue`/`name`). */
export class OperationImpactDto {
  operationId: string;
  protocol: string;
  @ApiProperty({ type: String, nullable: true })
  method: string | null;
  before: ExecutionStatsDto;
  after: ExecutionStatsDto;
}

export class JobImpactDto {
  queue: string;
  name: string;
  before: ExecutionStatsDto;
  after: ExecutionStatsDto;
}

/** An error group of the application first seen in [boundary, boundary + window). */
export class NewErrorGroupDto {
  id: string;
  @ApiProperty({ enum: ERROR_SOURCES, enumName: 'ErrorSource' })
  source: 'request' | 'job';
  @ApiProperty({ type: String, nullable: true })
  errorClass: string | null;
  message: string;
  /** All-time occurrences of the group. */
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export class ReleaseInstanceDto {
  /** The agent's serviceId. */
  serviceId: string;
  /** When this instance first and last reported the version. */
  firstSeenAt: string;
  lastSeenAt: string;
  /** Still running it: its latest version, reported in the last 5 minutes. */
  active: boolean;
}

export class ReleaseDetailDto extends ReleaseSummaryDto {
  /**
   * Top operations by requests on both sides (at most 10). `requests` is the all-traffic
   * row.
   */
  @ApiProperty({ type: [OperationImpactDto] })
  operations: OperationImpactDto[];
  /** Top jobs by runs on both sides (at most 10). */
  @ApiProperty({ type: [JobImpactDto] })
  jobImpact: JobImpactDto[];
  /** At most 50, oldest first. */
  @ApiProperty({ type: [NewErrorGroupDto] })
  newErrorGroups: NewErrorGroupDto[];
  /** Instances that reported the version, active first (at most 200). */
  @ApiProperty({ type: [ReleaseInstanceDto] })
  instances: ReleaseInstanceDto[];
}
