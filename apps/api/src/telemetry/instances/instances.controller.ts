import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScopeQueryDto } from '../common/query.dto.js';
import { ScopeResolver } from '../common/scope.js';
import { InstanceSummaryDto } from './instances.dto.js';
import { InstancesRepository } from './instances.repository.js';

@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(
    private readonly instances: InstancesRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listInstances',
    summary:
      'Instances (agent serviceIds) that sent telemetry, most recently seen first',
  })
  @ApiOkResponse({ type: [InstanceSummaryDto] })
  async list(@Query() query: ScopeQueryDto): Promise<InstanceSummaryDto[]> {
    return this.instances.list(await this.scopes.resolve(query));
  }
}
