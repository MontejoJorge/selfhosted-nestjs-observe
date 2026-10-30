import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Env } from '../../config/env.js';
import { ScopeResolver } from '../common/scope.js';
import { DataDaysDto, DataDaysQueryDto } from './data-days.dto.js';
import { DataDaysRepository } from './data-days.repository.js';

const DAY_MS = 86_400_000;

/** Days with telemetry, for the date picker of custom ranges. */
@ApiTags('projects')
@Controller()
export class DataDaysController {
  private readonly retentionDays: number;

  constructor(
    private readonly days: DataDaysRepository,
    private readonly scopes: ScopeResolver,
    config: ConfigService<Env, true>,
  ) {
    // Rollups (charts and stats) are the longest-lived telemetry.
    this.retentionDays = Math.max(
      config.get('RETENTION_DAYS', { infer: true }),
      config.get('AGGREGATE_RETENTION_DAYS', { infer: true }),
    );
  }

  @Get('projects/:project/data-days')
  @ApiOperation({
    operationId: 'listDataDays',
    summary:
      'UTC days on which the project (or one application) has telemetry, within the retention window',
    description:
      'A day counts when it has raw telemetry (from the ingest usage counts) or per-minute ' +
      'request or job rollups. Raw rows are kept for RETENTION_DAYS and rollups for ' +
      'AGGREGATE_RETENTION_DAYS, so older days may only have charts and stats. Covers ' +
      'today - AGGREGATE_RETENTION_DAYS through tomorrow (events up to 1 day ahead are ' +
      'accepted). `:project` is the project id or slug.',
  })
  @ApiOkResponse({ type: DataDaysDto })
  @ApiNotFoundResponse()
  async list(
    @Param('project') project: string,
    @Query() query: DataDaysQueryDto,
  ): Promise<DataDaysDto> {
    const scope = await this.scopes.resolve({
      project,
      application: query.application,
    });
    const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    const days = await this.days.list(scope, {
      from: new Date(today - this.retentionDays * DAY_MS),
      to: new Date(today + 2 * DAY_MS),
    });
    return {
      days,
      oldest: days[0] ?? null,
      newest: days[days.length - 1] ?? null,
    };
  }
}
