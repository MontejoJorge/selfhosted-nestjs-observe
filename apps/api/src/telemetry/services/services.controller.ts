import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import {
  DEFAULT_SLOW_SPANS,
  ServicesDto,
  ServicesQueryDto,
  SlowSpanDto,
  SlowSpansQueryDto,
} from './services.dto.js';
import {
  ServicesRepository,
  type ServicesFilter,
} from './services.repository.js';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listServices',
    summary: 'Own and total time per span class, with its methods',
    description:
      'Read from 5-minute rollups: the window starts at the 5-minute bucket containing `from`.',
  })
  @ApiOkResponse({ type: ServicesDto })
  async list(@Query() query: ServicesQueryDto): Promise<ServicesDto> {
    return this.services.services(await this.filter(query));
  }

  @Get('spans')
  @ApiOperation({
    operationId: 'listSlowestSpans',
    summary: 'Slowest spans of one class method, slowest first',
    description:
      'The slowest span of each 5-minute bucket, instance and operation, so one ' +
      'burst of slow calls shows up once per operation and instance.',
  })
  @ApiOkResponse({ type: [SlowSpanDto] })
  async spans(@Query() query: SlowSpansQueryDto): Promise<SlowSpanDto[]> {
    return this.services.slowestSpans({
      ...(await this.filter(query)),
      className: query.className,
      methodName: query.methodName,
      limit: query.limit ?? DEFAULT_SLOW_SPANS,
    });
  }

  private async filter(query: ServicesQueryDto): Promise<ServicesFilter> {
    return {
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
      source: query.source,
      operationId: query.operationId,
      queue: query.queue,
      name: query.name,
    };
  }
}
