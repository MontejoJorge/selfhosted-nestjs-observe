import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { TraceDetail } from '@selfhosted-observe/contracts';
import { ScopeQueryDto } from '../common/query.dto.js';
import { ScopeResolver } from '../common/scope.js';
import { JobsRepository } from '../jobs/jobs.repository.js';
import { LogsRepository } from '../logs/logs.repository.js';
import { RequestsRepository } from '../requests/requests.repository.js';
import { TraceDetailDto } from './traces.dto.js';

@ApiTags('traces')
@Controller('traces')
export class TracesController {
  constructor(
    private readonly requests: RequestsRepository,
    private readonly jobs: JobsRepository,
    private readonly logs: LogsRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  /**
   * Every execution sharing the trace id, plus its logs. Uses the trace_id index of
   * each partition, since a trace id carries no time.
   */
  @Get(':traceId')
  @ApiOperation({
    operationId: 'getTrace',
    summary: 'Executions and logs sharing a trace id',
  })
  @ApiOkResponse({ type: TraceDetailDto })
  @ApiNotFoundResponse()
  async detail(
    @Param('traceId') traceId: string,
    @Query() query: ScopeQueryDto,
  ): Promise<TraceDetail> {
    if (traceId.length === 0 || traceId.length > 255) {
      throw new BadRequestException('Invalid trace id');
    }
    const scope = await this.scopes.resolve(query);
    const [requests, jobs, logs] = await Promise.all([
      this.requests.findByTraceId(scope, traceId),
      this.jobs.findByTraceId(scope, traceId),
      this.logs.findByTraceId(scope, traceId),
    ]);
    if (requests.length === 0 && jobs.length === 0 && logs.length === 0) {
      throw new NotFoundException(`Trace ${traceId} not found`);
    }
    return { traceId, requests, jobs, logs };
  }
}
