import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Overview } from '@selfhosted-observe/contracts';
import { resolveWindow } from '../common/time-window.js';
import { OverviewDto, OverviewQueryDto } from './overview.dto.js';
import { OverviewRepository } from './overview.repository.js';

@ApiTags('overview')
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewRepository) {}

  @Get()
  @ApiOperation({
    operationId: 'getOverview',
    summary: 'Request, job and error totals with a request timeline',
  })
  @ApiOkResponse({ type: OverviewDto })
  get(@Query() query: OverviewQueryDto): Promise<Overview> {
    return this.overview.get({
      window: resolveWindow(query),
      serviceId: query.service,
      operationId: query.operationId,
      queue: query.queue,
      name: query.name,
    });
  }
}
