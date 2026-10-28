import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { decodeCursor, UUID_ID, type Page } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE, ScopeQueryDto } from '../common/query.dto.js';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import {
  JobDetailDto,
  JobPageDto,
  JobsQueryDto,
  JobStatsDto,
  QueuesQueryDto,
  type JobListItemDto,
} from './jobs.dto.js';
import { JobsRepository } from './jobs.repository.js';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get('queues')
  @ApiOperation({
    operationId: 'listQueues',
    summary: 'Job stats aggregated per queue and name',
  })
  @ApiOkResponse({ type: [JobStatsDto] })
  async queues(@Query() query: QueuesQueryDto): Promise<JobStatsDto[]> {
    return this.jobs.queues({
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
    });
  }

  @Get()
  @ApiOperation({
    operationId: 'listJobs',
    summary: 'Job executions, newest first',
  })
  @ApiOkResponse({ type: JobPageDto })
  async list(@Query() query: JobsQueryDto): Promise<Page<JobListItemDto>> {
    return this.jobs.list(
      {
        scope: await this.scopes.resolve(query),
        window: resolveWindow(query),
        queue: query.queue,
        name: query.name,
        status: query.status,
        traceId: query.traceId,
      },
      {
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        cursor: decodeCursor(query.cursor, UUID_ID),
      },
    );
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getJob',
    summary: 'One job execution with its span tree',
  })
  @ApiOkResponse({ type: JobDetailDto })
  @ApiNotFoundResponse()
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ScopeQueryDto,
  ): Promise<JobDetailDto> {
    const scope = await this.scopes.resolve(query);
    const job = await this.jobs.findById(scope, id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }
}
