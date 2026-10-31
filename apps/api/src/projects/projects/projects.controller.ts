import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
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
import {
  CreateProjectDto,
  ProjectDto,
  ProjectSummaryPageDto,
  StatsPageQueryDto,
  UpdateProjectDto,
  type ProjectSummaryDto,
} from './projects.dto.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';

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
    summary: 'Projects sorted by name, with request activity over the range',
  })
  @ApiOkResponse({ type: ProjectSummaryPageDto })
  list(@Query() query: StatsPageQueryDto): Promise<Page<ProjectSummaryDto>> {
    return this.repository.list(resolveWindow(query), {
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: decodeTextCursor(query.cursor),
    });
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
