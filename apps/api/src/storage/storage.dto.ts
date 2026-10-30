import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { USAGE_TABLES, type UsageTable } from '../database/database.types.js';

/** Raw tables counted per application (the split of a project's size). */
export const STORAGE_USAGE_TABLES = Object.keys(USAGE_TABLES) as UsageTable[];

export const STORAGE_TABLE_KINDS = ['raw', 'rollup', 'other'] as const;
export type StorageTableKind = (typeof STORAGE_TABLE_KINDS)[number];

export const STORAGE_TRIM_STATUSES = ['pending', 'running'] as const;
export type StorageTrimStatus = (typeof STORAGE_TRIM_STATUSES)[number];

const ESTIMATE =
  'Estimated on-disk bytes: the real size of each day partition (heap, TOAST and indexes) split ' +
  'between applications in proportion to the payload bytes counted at ingest.';

export class ProjectStorageQueryDto {
  /** Narrow the totals, the table split and the daily trend to one application of the project. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  application?: string;
}

export class CreateStorageTrimDto {
  /**
   * Keep today and the `keepDays` previous UTC days, delete older rows (1 to RETENTION_DAYS - 1).
   * With 14 days stored, 7 deletes the days 8 to 14 days ago.
   */
  @ApiProperty({ type: 'integer', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  keepDays: number;

  /** Trim one application of the project. Omit to trim every application of the project. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  application?: string;
}

/** Rows and estimated size of one raw table. */
export class TableUsageDto {
  @ApiProperty({ enum: STORAGE_USAGE_TABLES, enumName: 'StorageUsageTable' })
  table: UsageTable;
  /** Rows stored (exact, counted at ingest). */
  rows: number;
  @ApiProperty({ description: ESTIMATE })
  bytes: number;
}

/** One UTC day of stored raw telemetry. */
export class DayUsageDto {
  @ApiProperty({ format: 'date' })
  day: string;
  rows: number;
  @ApiProperty({ description: ESTIMATE })
  bytes: number;
  @ApiProperty({ type: [TableUsageDto] })
  tables: TableUsageDto[];
}

export class ApplicationUsageDto {
  @ApiProperty({ format: 'uuid' })
  applicationId: string;
  name: string;
  rows: number;
  @ApiProperty({ description: ESTIMATE })
  bytes: number;
  @ApiProperty({ type: [TableUsageDto] })
  tables: TableUsageDto[];
}

/** A pending or running "delete data older than N days" request. */
export class StorageTrimDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  /** The trimmed application; null when the trim covers the whole project. */
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  applicationId: string | null;
  keepDays: number;
  /** Rows before this UTC day are deleted. */
  @ApiProperty({ format: 'date' })
  cutoffDay: string;
  @ApiProperty({ format: 'date-time' })
  requestedAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: string | null;
  @ApiProperty({ enum: STORAGE_TRIM_STATUSES, enumName: 'StorageTrimStatus' })
  status: StorageTrimStatus;
  /** Tables and partitions processed so far. */
  doneSteps: number;
  /** Tables and partitions to process; null until the trim starts. */
  @ApiProperty({ type: Number, nullable: true })
  totalSteps: number | null;
}

/**
 * Storage of a project's raw telemetry (requests, jobs, logs, error occurrences, metrics
 * and profiles). Rollups and error groups are not counted per application.
 */
export class ProjectStorageDto {
  @ApiProperty({ format: 'uuid' })
  projectId: string;
  /** The application the totals, tables and days are narrowed to, if any. */
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  applicationId: string | null;
  /** RETENTION_DAYS: raw days kept; a trim keeps fewer (`keepDays` below this). */
  retentionDays: number;
  rows: number;
  @ApiProperty({ description: ESTIMATE })
  bytes: number;
  /** Split by table, largest first. */
  @ApiProperty({ type: [TableUsageDto] })
  tables: TableUsageDto[];
  /** Daily trend, oldest first (days with stored rows only). */
  @ApiProperty({ type: [DayUsageDto] })
  days: DayUsageDto[];
  /** Every application of the project, largest first (not narrowed by `application`). */
  @ApiProperty({ type: [ApplicationUsageDto] })
  applications: ApplicationUsageDto[];
  /** Pending and running trims of the project, oldest request first. */
  @ApiProperty({ type: [StorageTrimDto] })
  trims: StorageTrimDto[];
}

export class StorageTableSizeDto {
  /** Table name; partitioned tables are summed over their partitions. */
  table: string;
  /** `raw`: telemetry kept RETENTION_DAYS; `rollup`: AGGREGATE_RETENTION_DAYS; `other`: management, error groups, usage. */
  @ApiProperty({ enum: STORAGE_TABLE_KINDS, enumName: 'StorageTableKind' })
  kind: StorageTableKind;
  /** Real on-disk size: heap, TOAST and indexes. */
  bytes: number;
  /** Planner estimate of the rows (null before the first ANALYZE). */
  @ApiProperty({ type: Number, nullable: true })
  approxRows: number | null;
  /** Day partitions (0 for a plain table). */
  partitions: number;
}

export class StoragePartitionSizeDto {
  table: string;
  partition: string;
  @ApiProperty({ format: 'date' })
  day: string;
  /** Real on-disk size: heap, TOAST and indexes. */
  bytes: number;
  @ApiProperty({ type: Number, nullable: true })
  approxRows: number | null;
}

export class ProjectStorageSummaryDto {
  @ApiProperty({ format: 'uuid' })
  projectId: string;
  slug: string;
  name: string;
  rows: number;
  @ApiProperty({ description: ESTIMATE })
  bytes: number;
}

/** The whole database. */
export class StorageOverviewDto {
  /** `pg_database_size`: everything, including free space inside tables. */
  databaseBytes: number;
  retentionDays: number;
  aggregateRetentionDays: number;
  /** Every table, largest first. */
  @ApiProperty({ type: [StorageTableSizeDto] })
  tables: StorageTableSizeDto[];
  /** Day partitions of the partitioned tables, by table then day. */
  @ApiProperty({ type: [StoragePartitionSizeDto] })
  partitions: StoragePartitionSizeDto[];
  /** Raw telemetry per project, largest first. */
  @ApiProperty({ type: [ProjectStorageSummaryDto] })
  projects: ProjectStorageSummaryDto[];
}
