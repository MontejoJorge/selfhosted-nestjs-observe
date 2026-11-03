import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { USER_ID_MAX_LENGTH } from '../../ingest/domain/telemetry-batch.mapper.js';
import { PercentilesDto, TimeBucketDto } from '../common/common.dto.js';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export const DEFAULT_USER_LIMIT = 200;
export const MAX_USER_LIMIT = 1000;

export { USER_ID_MAX_LENGTH };

export class UsersQueryDto extends TimeRangeQueryDto {
  /** Case-insensitive substring of the user id. */
  @IsOptional()
  @IsString()
  @MaxLength(USER_ID_MAX_LENGTH)
  search?: string;

  /** Max users returned (default 200, max 1000). */
  @ApiPropertyOptional({ type: 'integer', default: DEFAULT_USER_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_USER_LIMIT)
  limit?: number;
}

export class UserDetailQueryDto extends TimeRangeQueryDto {}

export class UserStatsDto {
  /** The id the agent reported (`http.getUserId`); null for the requests without one. */
  @ApiProperty({ type: String, nullable: true })
  userId: string | null;
  requestCount: number;
  /** Failed requests (error captured or status >= 500). */
  errorCount: number;
  /** Ratio 0..1. */
  errorRate: number;
  latency: PercentilesDto;
  /** First request of the user within the range (ISO). */
  firstSeenAt: string;
  /** Last request of the user within the range (ISO). */
  lastSeenAt: string;
}

export class UserActivityBucketDto {
  /** Bucket start (ISO). */
  t: string;
  /** Distinct identified users with a request in the bucket. */
  users: number;
  /** Requests in the bucket, with or without a user id. */
  requests: number;
}

export class UsersDto {
  /** Distinct identified users in the range (ignores `search`). */
  userCount: number;
  /** Same buckets as the overview timeline, gap-filled (ignores `search`). */
  @ApiProperty({ type: [UserActivityBucketDto] })
  timeline: UserActivityBucketDto[];
  /**
   * By request count desc, at most `limit`. Includes one row with `userId: null` for
   * the requests without a user id, unless `search` is set.
   */
  @ApiProperty({ type: [UserStatsDto] })
  items: UserStatsDto[];
}

export class UserDetailDto extends UserStatsDto {
  /** Same buckets as the overview timeline. */
  @ApiProperty({ type: [TimeBucketDto] })
  timeline: TimeBucketDto[];
}
