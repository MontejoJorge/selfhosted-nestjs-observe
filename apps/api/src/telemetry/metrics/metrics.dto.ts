import { ApiProperty, OmitType } from '@nestjs/swagger';
import type {
  RuntimeInstance,
  RuntimeMetrics,
  RuntimeSeriesPoint,
  RuntimeSnapshot,
} from '@selfhosted-observe/contracts';
import { IsUUID } from 'class-validator';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export class RuntimeMetricsQueryDto extends OmitType(TimeRangeQueryDto, [
  'application',
] as const) {
  /** Required: runtime metrics are per application (aggregated across instances unless `instance` is set). */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  application: string;
}

export class RuntimeInstancesQueryDto extends OmitType(RuntimeMetricsQueryDto, [
  'instance',
] as const) {}

const nullableNumber = { type: Number, nullable: true } as const;

/**
 * One bucket. Gauges are averaged; per-interval deltas (CPU ms, GC counts and durations)
 * are summed, across instances too when no instance is selected. Memory is in megabytes.
 */
export class RuntimeSeriesPointDto implements RuntimeSeriesPoint {
  /** Bucket start (ISO). */
  t: string;
  /** Percent of one core, as reported by the agent. */
  @ApiProperty(nullableNumber)
  cpuPercent: number | null;
  /** CPU time in user mode during the bucket (ms, summed). */
  @ApiProperty(nullableNumber)
  cpuUserMs: number | null;
  /** CPU time in kernel mode during the bucket (ms, summed). */
  @ApiProperty(nullableNumber)
  cpuSystemMs: number | null;
  /** RSS in megabytes. */
  @ApiProperty(nullableNumber)
  memoryRss: number | null;
  /** RSS as percent of OS memory. */
  @ApiProperty(nullableNumber)
  memoryPercent: number | null;
  /** Megabytes. */
  @ApiProperty(nullableNumber)
  heapUsed: number | null;
  /** Megabytes. */
  @ApiProperty(nullableNumber)
  heapTotal: number | null;
  @ApiProperty(nullableNumber)
  eventLoopLagMs: number | null;
  /** 0..1 */
  @ApiProperty(nullableNumber)
  eventLoopUtilization: number | null;
  /** Summed. */
  @ApiProperty(nullableNumber)
  gcCount: number | null;
  /** Summed (ms). */
  @ApiProperty(nullableNumber)
  gcDurationMs: number | null;
  @ApiProperty(nullableNumber)
  gcMinorCount: number | null;
  @ApiProperty(nullableNumber)
  gcMinorMs: number | null;
  @ApiProperty(nullableNumber)
  gcMajorCount: number | null;
  @ApiProperty(nullableNumber)
  gcMajorMs: number | null;
  @ApiProperty(nullableNumber)
  gcIncrementalCount: number | null;
  @ApiProperty(nullableNumber)
  gcIncrementalMs: number | null;
}

/** KPI values. Memory is in megabytes. */
export class RuntimeSnapshotDto implements RuntimeSnapshot {
  @ApiProperty(nullableNumber)
  cpuPercent: number | null;
  @ApiProperty(nullableNumber)
  memoryPercent: number | null;
  @ApiProperty(nullableNumber)
  memoryRss: number | null;
  @ApiProperty(nullableNumber)
  heapUsed: number | null;
  @ApiProperty(nullableNumber)
  eventLoopLagMs: number | null;
  /** 0..1 */
  @ApiProperty(nullableNumber)
  eventLoopUtilization: number | null;
}

export class LatestRuntimeSampleDto extends RuntimeSnapshotDto {
  sampledAt: string;
  /** Instance that sent it. */
  serviceId: string;
}

export class RuntimeMetricsDto implements RuntimeMetrics {
  /** Averages over the range. */
  avg: RuntimeSnapshotDto;
  /** Newest sample in the range, null when there is none. */
  @ApiProperty({ type: LatestRuntimeSampleDto, nullable: true })
  latest: LatestRuntimeSampleDto | null;
  @ApiProperty({ type: [RuntimeSeriesPointDto] })
  series: RuntimeSeriesPointDto[];
}

export class RuntimeInstanceDto
  extends RuntimeSnapshotDto
  implements RuntimeInstance
{
  /** The agent's serviceId. */
  serviceId: string;
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  /** Time of its newest runtime sample. */
  lastSeenAt: string;
}
