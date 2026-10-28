import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import type {
  PageQuery,
  ScopeQuery,
  TimeRange,
  TimeRangeQuery,
} from '@selfhosted-observe/contracts';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TIME_RANGES = [
  '1h',
  '24h',
  '7d',
] as const satisfies readonly TimeRange[];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/** `range` or `from`/`to`. */
export class RangeQueryDto implements TimeRangeQuery {
  /** Relative window ending now (default `1h`). Ignored when `from` is given. */
  @ApiPropertyOptional({ enum: TIME_RANGES, enumName: 'TimeRange' })
  @IsOptional()
  @IsIn(TIME_RANGES)
  range?: TimeRange;

  /** Window start (ISO 8601). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Window end (ISO 8601), defaults to now. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** Scope shared by every telemetry route: a project, optionally narrowed to one application. */
export class ScopeQueryDto implements ScopeQuery {
  /** Project id or slug. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  project: string;

  /** Application id (must belong to the project). Omit for the whole project. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  application?: string;
}

/** Scope plus time range, and the optional `instance` (the agent's serviceId) filter. */
export class TimeRangeQueryDto extends IntersectionType(
  ScopeQueryDto,
  RangeQueryDto,
) {
  /** Filter by instance: the `serviceId` an agent reports. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  instance?: string;
}

/** Page size and cursor, without a time range or scope. */
export class CursorQueryDto implements PageQuery {
  /** Page size (default 50, max 500). */
  @ApiPropertyOptional({ type: 'integer', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  /** Opaque cursor: pass `nextCursor` from the previous page. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

/** Telemetry list query: scope, time range, page size and cursor (pass it with the same filters). */
export class PageQueryDto extends IntersectionType(
  TimeRangeQueryDto,
  CursorQueryDto,
) {}
