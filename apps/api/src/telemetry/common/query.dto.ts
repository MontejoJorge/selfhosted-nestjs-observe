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
  @IsOptional()
  @IsIn(TIME_RANGES)
  range?: TimeRange;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;
}

export class PageQueryDto extends TimeRangeQueryDto implements PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
