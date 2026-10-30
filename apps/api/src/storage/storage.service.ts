import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { StorageTrimmer } from '../maintenance/storage-trimmer.js';
import { ScopeResolver } from '../telemetry/common/scope.js';
import { apportion, type EstimatedCell } from './domain/apportion.js';
import { InvalidTrimError, trimCutoffDay } from './domain/trim.js';
import type {
  ApplicationUsageDto,
  CreateStorageTrimDto,
  DayUsageDto,
  ProjectStorageDto,
  StorageOverviewDto,
  StorageTrimDto,
  TableUsageDto,
} from './storage.dto.js';
import {
  StorageRepository,
  StorageTrimQueue,
  type StorageTrim,
} from './storage.repository.js';

interface Totals {
  rows: number;
  bytes: number;
}

function sum(cells: readonly EstimatedCell[]): Totals {
  let rows = 0;
  let bytes = 0;
  for (const cell of cells) {
    rows += cell.rows;
    bytes += cell.estimatedBytes;
  }
  return { rows, bytes };
}

function groupBy(
  cells: readonly EstimatedCell[],
  key: 'owner' | 'table' | 'day',
): Map<string, EstimatedCell[]> {
  const groups = new Map<string, EstimatedCell[]>();
  for (const cell of cells) {
    const group = groups.get(cell[key]);
    if (group) group.push(cell);
    else groups.set(cell[key], [cell]);
  }
  return groups;
}

const largestFirst = (a: Totals, b: Totals) => b.bytes - a.bytes;

function tablesOf(cells: readonly EstimatedCell[]): TableUsageDto[] {
  return [...groupBy(cells, 'table')]
    .map(([table, group]) => ({
      table: table as TableUsageDto['table'],
      ...sum(group),
    }))
    .sort(largestFirst);
}

function toTrimDto(trim: StorageTrim): StorageTrimDto {
  return {
    id: trim.id,
    applicationId: trim.applicationId,
    keepDays: trim.keepDays,
    cutoffDay: trim.cutoffDay,
    requestedAt: trim.requestedAt.toISOString(),
    startedAt: trim.startedAt?.toISOString() ?? null,
    status: trim.startedAt ? 'running' : 'pending',
    doneSteps: trim.doneSteps,
    totalSteps: trim.totalSteps,
  };
}

/** Storage views (sizes apportioned with `domain/apportion.ts`) and trim requests. */
@Injectable()
export class StorageService {
  private readonly retentionDays: number;
  private readonly aggregateRetentionDays: number;

  constructor(
    private readonly storage: StorageRepository,
    private readonly queue: StorageTrimQueue,
    private readonly trimmer: StorageTrimmer,
    private readonly scopes: ScopeResolver,
    config: ConfigService<Env, true>,
  ) {
    this.retentionDays = config.get('RETENTION_DAYS', { infer: true });
    this.aggregateRetentionDays = Math.max(
      this.retentionDays,
      config.get('AGGREGATE_RETENTION_DAYS', { infer: true }),
    );
  }

  async overview(): Promise<StorageOverviewDto> {
    const [databaseBytes, tables, partitions, sizes, totals, cells, projects] =
      await Promise.all([
        this.storage.databaseSize(),
        this.storage.tableSizes(),
        this.storage.partitionSizes(),
        this.storage.usageRelationSizes(),
        this.storage.dayTotals(),
        this.storage.projectCells(),
        this.storage.projects(),
      ]);
    const perProject = groupBy(apportion(cells, totals, sizes), 'owner');
    return {
      databaseBytes,
      retentionDays: this.retentionDays,
      aggregateRetentionDays: this.aggregateRetentionDays,
      tables,
      partitions,
      projects: projects
        .map((project) => ({
          projectId: project.id,
          slug: project.slug,
          name: project.name,
          ...sum(perProject.get(project.id) ?? []),
        }))
        .sort(largestFirst),
    };
  }

  async project(
    project: string,
    application?: string,
  ): Promise<ProjectStorageDto> {
    const scope = await this.scopes.resolve({ project, application });
    const [applications, sizes, totals, trims] = await Promise.all([
      this.storage.applicationsOf(scope.projectId),
      this.storage.usageRelationSizes(),
      this.storage.dayTotals(),
      this.storage.trimsOf(scope.projectId),
    ]);
    const cells = apportion(
      await this.storage.applicationCells(applications.map((a) => a.id)),
      totals,
      sizes,
    );
    const perApplication = groupBy(cells, 'owner');
    const inScope = application
      ? (perApplication.get(application) ?? [])
      : cells;

    const days: DayUsageDto[] = [...groupBy(inScope, 'day')]
      .map(([day, group]) => ({ day, ...sum(group), tables: tablesOf(group) }))
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const applicationUsage: ApplicationUsageDto[] = applications
      .map((app) => {
        const group = perApplication.get(app.id) ?? [];
        return {
          applicationId: app.id,
          name: app.name,
          ...sum(group),
          tables: tablesOf(group),
        };
      })
      .sort(largestFirst);

    return {
      projectId: scope.projectId,
      applicationId: application ?? null,
      retentionDays: this.retentionDays,
      ...sum(inScope),
      tables: tablesOf(inScope),
      days,
      applications: applicationUsage,
      trims: trims.map(toTrimDto),
    };
  }

  async trims(project: string): Promise<StorageTrimDto[]> {
    const scope = await this.scopes.resolve({ project });
    return (await this.storage.trimsOf(scope.projectId)).map(toTrimDto);
  }

  /** Queues the trim and starts the trimmer in the background. */
  async requestTrim(
    project: string,
    input: CreateStorageTrimDto,
  ): Promise<StorageTrimDto> {
    let cutoffDay: string;
    try {
      cutoffDay = trimCutoffDay(new Date(), input.keepDays, this.retentionDays);
    } catch (error) {
      if (error instanceof InvalidTrimError)
        throw new BadRequestException(error.message);
      throw error;
    }
    const scope = await this.scopes.resolve({
      project,
      application: input.application,
    });
    const trim = await this.queue.enqueue({
      projectId: scope.projectId,
      applicationId: input.application ?? null,
      keepDays: input.keepDays,
      cutoffDay,
    });
    this.trimmer.trigger();
    return toTrimDto(trim);
  }
}
