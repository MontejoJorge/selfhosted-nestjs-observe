import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateStorageTrimDto,
  ProjectStorageDto,
  ProjectStorageQueryDto,
  StorageOverviewDto,
  StorageTrimDto,
} from './storage.dto.js';
import { StorageService } from './storage.service.js';

const ESTIMATE =
  'Each day partition is split between applications by the payload bytes counted at ingest.';

const FREED_SPACE =
  'Deleted rows free their space for reuse by new telemetry right away; the VACUUM run ' +
  'after each partition gives only the empty pages at its end back to the OS, so the ' +
  'database shrinks partly until the partitions age out of RETENTION_DAYS.';

@ApiTags('storage')
@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('storage')
  @ApiOperation({
    operationId: 'getStorageOverview',
    summary:
      'Database size, size per table and per day partition, raw telemetry per project, and the retention settings',
    description:
      'Table and partition sizes are real (`pg_total_relation_size`: indexes and TOAST ' +
      `included). Project sizes are estimates. ${ESTIMATE}`,
  })
  @ApiOkResponse({ type: StorageOverviewDto })
  overview(): Promise<StorageOverviewDto> {
    return this.storage.overview();
  }

  @Get('projects/:project/storage')
  @ApiOperation({
    operationId: 'getProjectStorage',
    summary:
      'Raw telemetry stored by a project: total, per application, per table and per day, with pending trims',
    description:
      'Rows are exact (counted at ingest); bytes estimate the on-disk size. ' +
      `${ESTIMATE} Rollups and error groups are not counted. ` +
      '`:project` is the project id or slug.',
  })
  @ApiOkResponse({ type: ProjectStorageDto })
  @ApiNotFoundResponse()
  project(
    @Param('project') project: string,
    @Query() query: ProjectStorageQueryDto,
  ): Promise<ProjectStorageDto> {
    return this.storage.project(project, query.application);
  }

  @Get('projects/:project/storage/trims')
  @ApiOperation({
    operationId: 'listStorageTrims',
    summary: 'Pending and running trims of a project, oldest request first',
  })
  @ApiOkResponse({ type: [StorageTrimDto] })
  @ApiNotFoundResponse()
  trims(@Param('project') project: string): Promise<StorageTrimDto[]> {
    return this.storage.trims(project);
  }

  @Post('projects/:project/storage/trims')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createStorageTrim',
    summary:
      'Delete the raw telemetry of a project or one application older than the last `keepDays` days',
    description:
      'Runs in the background: poll `listStorageTrims` (or the `trims` of `getProjectStorage`) ' +
      'until the trim is gone. Deletes requests, jobs, logs, error occurrences, runtime and ' +
      'custom metrics and profiles before the cutoff day; rollups (charts and stats) and ' +
      'error groups keep their own retention. A pending trim of the same target is reused ' +
      `and moved to the later cutoff. ${FREED_SPACE}`,
  })
  @ApiAcceptedResponse({ type: StorageTrimDto })
  @ApiBadRequestResponse({
    description: '`keepDays` is not below RETENTION_DAYS',
  })
  @ApiNotFoundResponse()
  createTrim(
    @Param('project') project: string,
    @Body() body: CreateStorageTrimDto,
  ): Promise<StorageTrimDto> {
    return this.storage.requestTrim(project, body);
  }
}
