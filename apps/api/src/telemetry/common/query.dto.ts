import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  PageQuery,
  TimeRange,
  TimeRangeQuery,
} from '@selfhosted-observe/contracts';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TIME_RANGES = [
  '15m',
  '1h',
  '6h',
  '24h',
  '7d',
  '14d',
] as const satisfies readonly TimeRange[];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/** `range` or `from`/`to`, plus the optional `service` filter shared by every endpoint. */
export class TimeRangeQueryDto implements TimeRangeQuery {
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

  /** Filter by serviceId. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;
}

export class PageQueryDto extends TimeRangeQueryDto implements PageQuery {
  /** Page size (default 50, max 500). */
  @ApiPropertyOptional({ type: 'integer', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  /** Opaque cursor: pass `nextCursor` from the previous page, with the same filters. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
