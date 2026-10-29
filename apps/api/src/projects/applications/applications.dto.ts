import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CreatedApiKeyDto } from '../api-keys/api-keys.dto.js';
import { ActivityBucketDto } from '../projects/projects.dto.js';

export const MAX_TAGS = 3;
const MAX_TAG_LENGTH = 30;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimAll = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

export class ApplicationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  projectId: string;
  name: string;
  /** At most 3. */
  tags: string[];
  createdAt: string;
  /** Last telemetry batch received (updated at most every 30 s). */
  @ApiProperty({ type: String, nullable: true })
  lastSeenAt: string | null;
}

export class CreatedApplicationDto extends ApplicationDto {
  /**
   * The application's first API key (active). Its `secret` is returned only
   * here, once.
   */
  @ApiProperty({ type: CreatedApiKeyDto })
  apiKey: CreatedApiKeyDto;
}

export class ApplicationSummaryDto extends ApplicationDto {
  /** Requests in the range. */
  requestCount: number;
  requestsPerSecond: number;
  /** Ratio 0..1 of failed requests in the range. */
  errorRate: number;
  @ApiProperty({ type: Number, nullable: true })
  avgDurationMs: number | null;
  /** Latest runtime sample in the range (any instance), percent of one core. */
  @ApiProperty({ type: Number, nullable: true })
  cpuPercent: number | null;
  /** Latest runtime sample in the range, percent of OS memory used by RSS. */
  @ApiProperty({ type: Number, nullable: true })
  memoryPercent: number | null;
  /** Latest runtime sample in the range, RSS in megabytes. */
  @ApiProperty({ type: Number, nullable: true })
  memoryRssMb: number | null;
  /** Requests per bucket over the range, gap-filled. */
  @ApiProperty({ type: [ActivityBucketDto] })
  activity: ActivityBucketDto[];
}

export class ApplicationSummaryPageDto {
  @ApiProperty({ type: [ApplicationSummaryDto] })
  items: ApplicationSummaryDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class CreateApplicationDto {
  /** Unique within the project. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_TAGS })
  @Transform(trimAll)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];
}

export class UpdateApplicationDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  /** Replaces all tags. */
  @ApiPropertyOptional({ type: [String], maxItems: MAX_TAGS })
  @Transform(trimAll)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];
}
