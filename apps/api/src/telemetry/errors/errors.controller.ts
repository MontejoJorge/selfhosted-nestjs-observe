import {
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
import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import { decodeCursor, NUMERIC_ID } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../common/query.dto.js';
import { resolveWindow } from '../common/time-window.js';
import {
  ErrorDetailQueryDto,
  ErrorGroupDetailDto,
  ErrorGroupPageDto,
  ErrorsQueryDto,
} from './errors.dto.js';
import { ErrorsRepository } from './errors.repository.js';

@ApiTags('errors')
@Controller('errors')
export class ErrorsController {
  constructor(private readonly errors: ErrorsRepository) {}

  @Get()
  @ApiOperation({
    operationId: 'listErrorGroups',
    summary: 'Error groups seen in the range, most recently seen first',
  })
  @ApiOkResponse({ type: ErrorGroupPageDto })
  list(@Query() query: ErrorsQueryDto): Promise<Page<ErrorGroup>> {
    return this.errors.list(
      {
        window: resolveWindow(query),
        serviceId: query.service,
        source: query.source,
      },
      {
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        cursor: decodeCursor(query.cursor, NUMERIC_ID),
      },
    );
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getErrorGroup',
    summary:
      'One error group with timeline and recent occurrences in the range',
  })
  @ApiOkResponse({ type: ErrorGroupDetailDto })
  @ApiNotFoundResponse()
  async detail(
    @Param('id') id: string,
    @Query() query: ErrorDetailQueryDto,
  ): Promise<ErrorGroupDetail> {
    const group = NUMERIC_ID.test(id)
      ? await this.errors.findById(id, resolveWindow(query))
      : null;
    if (!group) throw new NotFoundException(`Error group ${id} not found`);
    return group;
  }
}
