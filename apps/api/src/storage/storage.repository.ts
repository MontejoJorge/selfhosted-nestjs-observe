import type { DayTotal, RelationSize, UsageCell } from './domain/apportion.js';
import type { StorageTableKind } from './storage.dto.js';

export interface TableSize {
  table: string;
  kind: StorageTableKind;
  bytes: number;
  approxRows: number | null;
  partitions: number;
}

export interface PartitionSize {
  table: string;
  partition: string;
  day: string;
  bytes: number;
  approxRows: number | null;
}

export interface ProjectRef {
  id: string;
  slug: string;
  name: string;
}

export interface ApplicationRef {
  id: string;
  name: string;
}

export interface StorageTrim {
  id: string;
  projectId: string;
  applicationId: string | null;
  keepDays: number;
  cutoffDay: string;
  requestedAt: Date;
  startedAt: Date | null;
  doneSteps: number;
  totalSteps: number | null;
}

export interface TrimRequest {
  projectId: string;
  applicationId: string | null;
  keepDays: number;
  cutoffDay: string;
}

/** Read port: catalog sizes and the usage counters. */
export abstract class StorageRepository {
  abstract databaseSize(): Promise<number>;
  /** Every table of the schema; partitioned ones summed over their partitions. */
  abstract tableSizes(): Promise<TableSize[]>;
  /** Day partitions of the partitioned tables. */
  abstract partitionSizes(): Promise<PartitionSize[]>;
  /** Real sizes of the usage-counted tables: per day partition, or whole for plain tables. */
  abstract usageRelationSizes(): Promise<RelationSize[]>;
  /** Counted payload bytes of every application (deleted ones not purged yet included) per table and day. */
  abstract dayTotals(): Promise<DayTotal[]>;
  /** Usage of the given applications, owner = application id. */
  abstract applicationCells(applicationIds: string[]): Promise<UsageCell[]>;
  /** Usage of the live projects, owner = project id. */
  abstract projectCells(): Promise<UsageCell[]>;
  abstract projects(): Promise<ProjectRef[]>;
  abstract applicationsOf(projectId: string): Promise<ApplicationRef[]>;
  abstract trimsOf(projectId: string): Promise<StorageTrim[]>;
}

/** Write port: the queue of storage trims processed by `StorageTrimmer`. */
export abstract class StorageTrimQueue {
  /**
   * Queues a trim. A pending trim of the same target is kept and moved to the later
   * cutoff (the request deleting more wins), so repeated clicks do not pile up.
   */
  abstract enqueue(request: TrimRequest): Promise<StorageTrim>;
}
