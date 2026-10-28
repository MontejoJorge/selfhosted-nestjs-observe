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
import type {
  JobDetail,
  JobListItem,
  JobStats,
  Page,
} from '@selfhosted-observe/contracts';
import { decodeCursor, UUID_ID } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../common/query.dto.js';
import { resolveWindow } from '../common/time-window.js';
import {
  JobDetailDto,
  JobPageDto,
  JobsQueryDto,
  JobStatsDto,
  QueuesQueryDto,
} from './jobs.dto.js';
import { JobsRepository } from './jobs.repository.js';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsRepository) {}

  @Get('queues')
  @ApiOperation({
    operationId: 'listQueues',
    summary: 'Job stats aggregated per queue and name',
  })
  @ApiOkResponse({ type: [JobStatsDto] })
  queues(@Query() query: QueuesQueryDto): Promise<JobStats[]> {
    return this.jobs.queues({
      window: resolveWindow(query),
      serviceId: query.service,
    });
  }

  @Get()
  @ApiOperation({
    operationId: 'listJobs',
    summary: 'Job executions, newest first',
  })
  @ApiOkResponse({ type: JobPageDto })
  list(@Query() query: JobsQueryDto): Promise<Page<JobListItem>> {
    return this.jobs.list(
      {
        window: resolveWindow(query),
        serviceId: query.service,
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
  ): Promise<JobDetail> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }
}
