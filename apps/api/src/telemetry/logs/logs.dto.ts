import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LogItem, LogLevel, Page } from '@selfhosted-observe/contracts';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JSON_OBJECT_SCHEMA } from '../common/common.dto.js';
import { PageQueryDto } from '../common/query.dto.js';

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];

export class LogsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: LOG_LEVELS, enumName: 'LogLevel' })
  @IsOptional()
  @IsIn(LOG_LEVELS)
  level?: LogLevel;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  traceId?: string;

  /** Exact logger context. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  context?: string;

  /** Case-insensitive substring of the log text. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;
}

export class LogItemDto implements LogItem {
  /** UUIDv7 */
  id: string;
  applicationId: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  timestamp: string;
  @ApiProperty({ enum: LOG_LEVELS, enumName: 'LogLevel', nullable: true })
  level: LogLevel | null;
  @ApiProperty({ type: String, nullable: true })
  context: string | null;
  text: string;
  @ApiProperty({ type: String, nullable: true })
  traceId: string | null;
  @ApiProperty({ type: String, nullable: true })
  spanId: string | null;
  @ApiProperty({ ...JSON_OBJECT_SCHEMA, nullable: true })
  attributes: Record<string, unknown> | null;
}

export class LogPageDto implements Page<LogItem> {
  @ApiProperty({ type: [LogItemDto] })
  items: LogItemDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
