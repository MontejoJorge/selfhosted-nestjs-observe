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
import { ScopeResolver } from '../common/scope.js';
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
  constructor(
    private readonly errors: ErrorsRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listErrorGroups',
    summary: 'Error groups seen in the range, most recently seen first',
  })
  @ApiOkResponse({ type: ErrorGroupPageDto })
  async list(@Query() query: ErrorsQueryDto): Promise<Page<ErrorGroup>> {
    return this.errors.list(
      {
        scope: await this.scopes.resolve(query),
        window: resolveWindow(query),
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
    const scope = await this.scopes.resolve(query);
    const group = NUMERIC_ID.test(id)
      ? await this.errors.findById(scope, id, resolveWindow(query))
      : null;
    if (!group) throw new NotFoundException(`Error group ${id} not found`);
    return group;
  }
}
