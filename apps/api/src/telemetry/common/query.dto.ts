import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Relative windows ending now, shortest first (`RANGE_MS` in time-window.ts has their lengths). */
export const TIME_RANGES = [
  '1h',
  '3h',
  '6h',
  '12h',
  '24h',
  '3d',
  '7d',
  '15d',
] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

/** Longest window a query may ask for (custom `from`/`to`). */
export const MAX_WINDOW_DAYS = 31;

/** A full date-time with an explicit offset, so the server's time zone never matters. */
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T[^\s]+(Z|[+-]\d{2}:?\d{2})$/i;
const isoMessage = (field: string) =>
  `${field} must be a valid ISO 8601 date-time, e.g. 2026-10-30T12:00:00Z`;
const zonedMessage = (field: string) =>
  `${field} must include a time and a time zone (Z or +hh:mm), e.g. 2026-10-30T12:00:00Z`;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/**
 * `range`, or a custom `from`/`to` (`from` < `to`, at most 31 days apart). With only `to`,
 * the window is the `range` ending at `to`; with only `from`, it ends now.
 */
export class RangeQueryDto {
  /** Relative window ending now (default `1h`). Ignored when `from` is given. */
  @ApiPropertyOptional({ enum: TIME_RANGES, enumName: 'TimeRange' })
  @IsOptional()
  @IsIn(TIME_RANGES)
  range?: TimeRange;

  /** Window start (ISO 8601 date-time with a time zone), inclusive. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: isoMessage('from') })
  @Matches(ZONED_DATE_TIME, { message: zonedMessage('from') })
  from?: string;

  /** Window end (ISO 8601 date-time with a time zone), exclusive; defaults to now. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: isoMessage('to') })
  @Matches(ZONED_DATE_TIME, { message: zonedMessage('to') })
  to?: string;
}

/** Scope shared by every telemetry route: a project, optionally narrowed to one application. */
export class ScopeQueryDto {
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
export class CursorQueryDto {
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
