import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { decodeCursor, UUID_ID, type Page } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../common/query.dto.js';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import { LogPageDto, LogsQueryDto, type LogItemDto } from './logs.dto.js';
import { LogsRepository } from './logs.repository.js';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(
    private readonly logs: LogsRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listLogs',
    summary: 'Log entries, newest first',
  })
  @ApiOkResponse({ type: LogPageDto })
  async list(@Query() query: LogsQueryDto): Promise<Page<LogItemDto>> {
    return this.logs.list(
      {
        scope: await this.scopes.resolve(query),
        window: resolveWindow(query),
        level: query.level,
        traceId: query.traceId,
        context: query.context,
        q: query.q,
      },
      {
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        cursor: decodeCursor(query.cursor, UUID_ID),
      },
    );
  }
}
