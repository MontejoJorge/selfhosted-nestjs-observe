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
  OperationStats,
  Page,
  RequestDetail,
  RequestListItem,
} from '@selfhosted-observe/contracts';
import { decodeCursor, UUID_ID } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../common/query.dto.js';
import { resolveWindow } from '../common/time-window.js';
import {
  OperationsQueryDto,
  OperationStatsDto,
  RequestDetailDto,
  RequestPageDto,
  RequestsQueryDto,
} from './requests.dto.js';
import { RequestsRepository } from './requests.repository.js';

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsRepository) {}

  @Get('operations')
  @ApiOperation({
    operationId: 'listOperations',
    summary: 'Request stats aggregated per operation',
  })
  @ApiOkResponse({ type: [OperationStatsDto] })
  operations(@Query() query: OperationsQueryDto): Promise<OperationStats[]> {
    return this.requests.operations({
      window: resolveWindow(query),
      serviceId: query.service,
    });
  }

  @Get()
  @ApiOperation({
    operationId: 'listRequests',
    summary: 'Request executions, newest first',
  })
  @ApiOkResponse({ type: RequestPageDto })
  list(@Query() query: RequestsQueryDto): Promise<Page<RequestListItem>> {
    return this.requests.list(
      {
        window: resolveWindow(query),
        serviceId: query.service,
        operationId: query.operationId,
        status: query.status,
        minDurationMs: query.minDuration,
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
    operationId: 'getRequest',
    summary: 'One request with its span tree',
  })
  @ApiOkResponse({ type: RequestDetailDto })
  @ApiNotFoundResponse()
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequestDetail> {
    const request = await this.requests.findById(id);
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }
}
