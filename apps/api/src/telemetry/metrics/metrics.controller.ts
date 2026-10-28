import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CustomMetricSummary,
  RuntimeSeriesPoint,
} from '@selfhosted-observe/contracts';
import { resolveWindow } from '../common/time-window.js';
import {
  CustomMetricsQueryDto,
  CustomMetricSummaryDto,
  RuntimeMetricsQueryDto,
  RuntimeSeriesPointDto,
} from './metrics.dto.js';
import { MetricsRepository } from './metrics.repository.js';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsRepository) {}

  @Get('runtime')
  @ApiOperation({
    operationId: 'getRuntimeMetrics',
    summary: 'CPU, memory, event loop and GC series for one service',
  })
  @ApiOkResponse({ type: [RuntimeSeriesPointDto] })
  runtime(
    @Query() query: RuntimeMetricsQueryDto,
  ): Promise<RuntimeSeriesPoint[]> {
    return this.metrics.runtime(query.service, resolveWindow(query));
  }

  @Get('custom')
  @ApiOperation({
    operationId: 'listCustomMetrics',
    summary: 'Latest value of each custom metric in the range',
  })
  @ApiOkResponse({ type: [CustomMetricSummaryDto] })
  custom(
    @Query() query: CustomMetricsQueryDto,
  ): Promise<CustomMetricSummary[]> {
    return this.metrics.custom(resolveWindow(query), query.service);
  }
}
