import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import type {
  OperationStats,
  Page,
  RequestDetail,
  RequestListItem,
} from '@selfhosted-observe/contracts';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { decodeCursor, UUID_ID } from '../common/cursor.js';
import {
  DEFAULT_PAGE_SIZE,
  PageQueryDto,
  TimeRangeQueryDto,
} from '../common/query.dto.js';
import { resolveWindow } from '../common/time-window.js';
import {
  RequestsRepository,
  type RequestFilter,
} from './requests.repository.js';

export class OperationsQueryDto extends TimeRangeQueryDto {}

export class RequestsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  operationId?: string;

  @IsOptional()
  @IsIn(['ok', 'error'])
  status?: 'ok' | 'error';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minDuration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  traceId?: string;
}

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsRepository) {}

  /** GET /api/requests/operations */
  @Get('operations')
  operations(@Query() query: OperationsQueryDto): Promise<OperationStats[]> {
    return this.requests.operations({
      window: resolveWindow(query),
      serviceId: query.service,
    });
  }

  /** GET /api/requests */
  @Get()
  list(@Query() query: RequestsQueryDto): Promise<Page<RequestListItem>> {
    const filter: RequestFilter = {
      window: resolveWindow(query),
      serviceId: query.service,
      operationId: query.operationId,
      status: query.status,
      minDurationMs: query.minDuration,
      traceId: query.traceId,
    };
    return this.requests.list(filter, {
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: decodeCursor(query.cursor, UUID_ID),
    });
  }

  /** GET /api/requests/:id */
  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequestDetail> {
    const request = await this.requests.findById(id);
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }
}
