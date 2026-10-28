import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import {
  RuntimeInstanceDto,
  RuntimeInstancesQueryDto,
  RuntimeMetricsDto,
  RuntimeMetricsQueryDto,
} from './metrics.dto.js';
import { MetricsRepository } from './metrics.repository.js';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get('runtime')
  @ApiOperation({
    operationId: 'getRuntimeMetrics',
    summary:
      'Runtime KPIs and CPU, memory, event loop and GC series of one application (or one of its instances)',
  })
  @ApiOkResponse({ type: RuntimeMetricsDto })
  @ApiNotFoundResponse()
  async runtime(
    @Query() query: RuntimeMetricsQueryDto,
  ): Promise<RuntimeMetricsDto> {
    return this.metrics.runtime(
      await this.scopes.resolve(query),
      resolveWindow(query),
    );
  }

  @Get('runtime/instances')
  @ApiOperation({
    operationId: 'listRuntimeInstances',
    summary:
      'Instances of an application that sent runtime samples in the range, with their newest sample',
  })
  @ApiOkResponse({ type: [RuntimeInstanceDto] })
  @ApiNotFoundResponse()
  async instances(
    @Query() query: RuntimeInstancesQueryDto,
  ): Promise<RuntimeInstanceDto[]> {
    return this.metrics.instances(
      await this.scopes.resolve(query),
      resolveWindow(query),
    );
  }
}
