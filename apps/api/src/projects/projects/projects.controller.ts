import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { decodeTextCursor, type Page } from '../../telemetry/common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../../telemetry/common/query.dto.js';
import { resolveWindow } from '../../telemetry/common/time-window.js';
import { POSITION_KEY } from '../domain/project-order.js';
import {
  CreateProjectDto,
  ProjectDto,
  ProjectSummaryPageDto,
  ReorderProjectsDto,
  StatsPageQueryDto,
  UpdateProjectDto,
  type ProjectSummaryDto,
} from './projects.dto.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';

/** A list cursor, whose key must be a position (not a name, as before the manual order). */
function positionCursor(raw: string | undefined) {
  const cursor = decodeTextCursor(raw);
  if (cursor && !POSITION_KEY.test(cursor.key))
    throw new BadRequestException('Invalid cursor');
  return cursor;
}

/** `:project` is the project id or slug. */
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly repository: ProjectsRepository,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listProjects',
    summary:
      'Projects in their manual order (new ones last), with request activity over the range',
  })
  @ApiOkResponse({ type: ProjectSummaryPageDto })
  list(@Query() query: StatsPageQueryDto): Promise<Page<ProjectSummaryDto>> {
    return this.repository.list(resolveWindow(query), {
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: positionCursor(query.cursor),
    });
  }

  @Put('order')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'reorderProjects',
    summary: 'Set the order of the projects page',
    description:
      'Positions follow `projectIds`, which must list every project once.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Not every project exactly once' })
  reorder(@Body() body: ReorderProjectsDto): Promise<void> {
    return this.projects.reorder(body.projectIds);
  }

  @Get(':project')
  @ApiOperation({ operationId: 'getProject', summary: 'One project' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse()
  get(@Param('project') project: string): Promise<ProjectDto> {
    return this.projects.get(project);
  }

  @Post()
  @ApiOperation({
    operationId: 'createProject',
    summary: 'Create a project (the slug is generated from the name)',
  })
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() body: CreateProjectDto): Promise<ProjectDto> {
    return this.projects.create(body);
  }

  @Patch(':project')
  @ApiOperation({
    operationId: 'updateProject',
    summary:
      'Rename a project, change its description or its three range presets (the slug is kept)',
  })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse()
  update(
    @Param('project') project: string,
    @Body() body: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.update(project, body);
  }

  @Delete(':project')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteProject',
    summary:
      'Delete a project with its applications and API keys; telemetry is purged in the background',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  delete(@Param('project') project: string): Promise<void> {
    return this.projects.delete(project);
  }
}
