import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import { MapDto, MapQueryDto } from './map.dto.js';
import { MapRepository } from './map.repository.js';

@ApiTags('map')
@Controller('map')
export class MapController {
  constructor(
    private readonly maps: MapRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getMap',
    summary:
      'How the applications, queues, databases and external services talk to each other',
    description:
      'Applications and queues come from the per-minute rollups, databases and external ' +
      'services from the outbound spans of the 5-minute span rollup (spans ingested ' +
      'before it existed are not covered). Links from an application to a queue or to ' +
      'another application are inferred from executions sharing a trace id, over the ' +
      'latest 5000 requests and 5000 jobs of the window (`sampled` when there were more).',
  })
  @ApiOkResponse({ type: MapDto })
  async get(@Query() query: MapQueryDto): Promise<MapDto> {
    return this.maps.map({
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
    });
  }
}
