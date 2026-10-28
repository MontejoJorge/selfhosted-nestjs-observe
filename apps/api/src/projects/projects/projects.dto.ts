import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import type {
  ActivityBucket,
  CreateProjectInput,
  Page,
  Project,
  ProjectSummary,
  UpdateProjectInput,
} from '@selfhosted-observe/contracts';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CursorQueryDto,
  RangeQueryDto,
} from '../../telemetry/common/query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Page of a management list over a time range (for the activity stats). */
export class StatsPageQueryDto extends IntersectionType(
  RangeQueryDto,
  CursorQueryDto,
) {}

export class ActivityBucketDto implements ActivityBucket {
  /** Bucket start (ISO). */
  t: string;
  count: number;
  errors: number;
  /** Mean duration (ms), null when the bucket has no requests. */
  @ApiProperty({ type: Number, nullable: true })
  avgDurationMs: number | null;
}

export class ProjectDto implements Project {
  @ApiProperty({ format: 'uuid' })
  id: string;
  /** URL-safe and unique; generated from the name at creation and never changed. */
  slug: string;
  name: string;
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  createdAt: string;
  applicationCount: number;
}

export class ProjectSummaryDto extends ProjectDto implements ProjectSummary {
  /** Most recent telemetry from any of its applications. */
  @ApiProperty({ type: String, nullable: true })
  lastSeenAt: string | null;
  /** Requests in the range. */
  requestCount: number;
  /** Mean request duration (ms) in the range. */
  @ApiProperty({ type: Number, nullable: true })
  avgDurationMs: number | null;
  /** Requests per bucket over the range, gap-filled. */
  @ApiProperty({ type: [ActivityBucketDto] })
  activity: ActivityBucketDto[];
}

export class ProjectSummaryPageDto implements Page<ProjectSummary> {
  @ApiProperty({ type: [ProjectSummaryDto] })
  items: ProjectSummaryDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class CreateProjectDto implements CreateProjectInput {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateProjectDto implements UpdateProjectInput {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  /** null or an empty string clears it. */
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(trim)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
