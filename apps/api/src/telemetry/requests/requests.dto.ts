import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { Primitive, WireError } from '../../ingest/domain/wire.js';
import {
  JSON_OBJECT_SCHEMA,
  PercentilesDto,
  TAGS_SCHEMA,
  TraceSpanDto,
  WireErrorDto,
} from '../common/common.dto.js';
import { PageQueryDto, TimeRangeQueryDto } from '../common/query.dto.js';

export const REQUEST_STATUSES = ['ok', 'error'] as const;

export class OperationsQueryDto extends TimeRangeQueryDto {}

export class RequestsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  operationId?: string;

  /** `error` = failed requests (error captured or status >= 500). */
  @ApiPropertyOptional({ enum: REQUEST_STATUSES, enumName: 'RequestStatus' })
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: 'ok' | 'error';

  /** Minimum duration in ms. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minDuration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  traceId?: string;
}

export class OperationStatsDto {
  operationId: string;
  /** `http`, `rpc`, `grpc`, `graphql` or `ws`. */
  protocol: string;
  @ApiProperty({ type: String, nullable: true })
  method: string | null;
  count: number;
  errorCount: number;
  /** Ratio 0..1. */
  errorRate: number;
  latency: PercentilesDto;
  lastSeenAt: string;
}

export class RequestListItemDto {
  /** UUIDv7 */
  id: string;
  traceId: string;
  applicationId: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  operationId: string;
  protocol: string;
  @ApiProperty({ type: String, nullable: true })
  method: string | null;
  @ApiProperty({ type: Number, nullable: true })
  statusCode: number | null;
  @ApiProperty({ type: String, nullable: true })
  url: string | null;
  durationMs: number;
  calledAt: string;
  @ApiProperty({ type: String, nullable: true })
  userId: string | null;
  hasError: boolean;
}

export class RequestDetailDto extends RequestListItemDto {
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  @ApiProperty(TAGS_SCHEMA)
  tags: Record<string, Primitive>;
  @ApiProperty({ type: WireErrorDto, nullable: true })
  error: WireError | null;
  /** Captured request (redacted headers / body). */
  @ApiProperty({ ...JSON_OBJECT_SCHEMA, nullable: true })
  request: Record<string, unknown> | null;
  @ApiProperty({ type: [TraceSpanDto] })
  trace: TraceSpanDto[];
}

export class RequestPageDto {
  @ApiProperty({ type: [RequestListItemDto] })
  items: RequestListItemDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
