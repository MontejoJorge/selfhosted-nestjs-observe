import { ApiProperty, OmitType } from '@nestjs/swagger';
import type {
  CustomMetricSummary,
  RuntimeSeriesPoint,
} from '@selfhosted-observe/contracts';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export const METRIC_TYPES = ['counter', 'gauge', 'summary'] as const;

export class RuntimeMetricsQueryDto extends OmitType(TimeRangeQueryDto, [
  'service',
] as const) {
  /** Required: runtime metrics are per service. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  service: string;
}

export class CustomMetricsQueryDto extends TimeRangeQueryDto {}

/** Runtime samples averaged per bucket (gcCount and gcDurationMs are summed). */
export class RuntimeSeriesPointDto implements RuntimeSeriesPoint {
  /** Bucket start (ISO). */
  t: string;
  /** As reported by the agent (expected 0..100). */
  @ApiProperty({ type: Number, nullable: true })
  cpuPercent: number | null;
  /** Bytes. */
  @ApiProperty({ type: Number, nullable: true })
  memoryRss: number | null;
  /** Bytes. */
  @ApiProperty({ type: Number, nullable: true })
  heapUsed: number | null;
  /** Bytes. */
  @ApiProperty({ type: Number, nullable: true })
  heapTotal: number | null;
  @ApiProperty({ type: Number, nullable: true })
  eventLoopLagMs: number | null;
  /** 0..1 */
  @ApiProperty({ type: Number, nullable: true })
  eventLoopUtilization: number | null;
  @ApiProperty({ type: Number, nullable: true })
  gcCount: number | null;
  @ApiProperty({ type: Number, nullable: true })
  gcDurationMs: number | null;
}

export class CustomMetricSummaryDto implements CustomMetricSummary {
  name: string;
  @ApiProperty({ enum: METRIC_TYPES, enumName: 'CustomMetricType' })
  type: 'counter' | 'gauge' | 'summary';
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  /** Scalar of the latest sample (sum over labels; mean for summaries and ratios; max for peaks). */
  @ApiProperty({ type: Number, nullable: true })
  lastValue: number | null;
  lastSeenAt: string;
}
