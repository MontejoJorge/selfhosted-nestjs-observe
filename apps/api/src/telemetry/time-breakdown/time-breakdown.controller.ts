import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import {
  DEFAULT_SLOW_SPANS,
  SlowSpanDto,
  SlowSpansQueryDto,
  TimeBreakdownDto,
  TimeBreakdownQueryDto,
} from './time-breakdown.dto.js';
import {
  TimeBreakdownRepository,
  type TimeBreakdownFilter,
} from './time-breakdown.repository.js';

@ApiTags('time-breakdown')
@Controller('time-breakdown')
export class TimeBreakdownController {
  constructor(
    private readonly breakdown: TimeBreakdownRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getTimeBreakdown',
    summary: 'Time spent per span class and method, by self time',
    description:
      'Read from 5-minute rollups: the window starts at the 5-minute bucket containing `from`.',
  })
  @ApiOkResponse({ type: TimeBreakdownDto })
  async get(@Query() query: TimeBreakdownQueryDto): Promise<TimeBreakdownDto> {
    return this.breakdown.breakdown(await this.filter(query));
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
    return this.breakdown.slowestSpans({
      ...(await this.filter(query)),
      className: query.className,
      methodName: query.methodName,
      origin: query.origin,
      limit: query.limit ?? DEFAULT_SLOW_SPANS,
    });
  }

  private async filter(
    query: TimeBreakdownQueryDto,
  ): Promise<TimeBreakdownFilter> {
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
