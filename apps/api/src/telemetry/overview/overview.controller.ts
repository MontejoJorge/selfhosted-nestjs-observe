import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Overview } from '@selfhosted-observe/contracts';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import { OverviewDto, OverviewQueryDto } from './overview.dto.js';
import { OverviewRepository } from './overview.repository.js';

@ApiTags('overview')
@Controller('overview')
export class OverviewController {
  constructor(
    private readonly overview: OverviewRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getOverview',
    summary: 'Request, job and error totals with a request timeline',
  })
  @ApiOkResponse({ type: OverviewDto })
  async get(@Query() query: OverviewQueryDto): Promise<Overview> {
    return this.overview.get({
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
      operationId: query.operationId,
      queue: query.queue,
      name: query.name,
    });
  }
}
