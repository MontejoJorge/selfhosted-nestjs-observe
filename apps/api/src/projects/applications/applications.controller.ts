import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
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
import { StatsPageQueryDto } from '../projects/projects.dto.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  ApplicationDto,
  ApplicationSummaryPageDto,
  CreateApplicationDto,
  UpdateApplicationDto,
  type ApplicationSummaryDto,
} from './applications.dto.js';
import { ApplicationsRepository } from './applications.repository.js';
import { ApplicationsService } from './applications.service.js';

/** `:project` is the project id or slug. Each application is a separate Nest service. */
@ApiTags('applications')
@Controller('projects/:project/applications')
export class ApplicationsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly applications: ApplicationsService,
    private readonly repository: ApplicationsRepository,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listApplications',
    summary:
      'Applications of a project sorted by name, with request and runtime stats over the range',
  })
  @ApiOkResponse({ type: ApplicationSummaryPageDto })
  @ApiNotFoundResponse()
  async list(
    @Param('project') project: string,
    @Query() query: StatsPageQueryDto,
  ): Promise<Page<ApplicationSummaryDto>> {
    const { id } = await this.projects.get(project);
    return this.repository.list(id, resolveWindow(query), {
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: decodeTextCursor(query.cursor),
    });
  }

  @Get(':applicationId')
  @ApiOperation({ operationId: 'getApplication', summary: 'One application' })
  @ApiOkResponse({ type: ApplicationDto })
  @ApiNotFoundResponse()
  async get(
    @Param('project') project: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ): Promise<ApplicationDto> {
    const { id } = await this.projects.get(project);
    return this.applications.get(id, applicationId);
  }

  @Post()
  @ApiOperation({
    operationId: 'createApplication',
    summary: 'Create an application (name unique in the project, up to 3 tags)',
  })
  @ApiCreatedResponse({ type: ApplicationDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async create(
    @Param('project') project: string,
    @Body() body: CreateApplicationDto,
  ): Promise<ApplicationDto> {
    const { id } = await this.projects.get(project);
    return this.applications.create(id, body);
  }

  @Patch(':applicationId')
  @ApiOperation({
    operationId: 'updateApplication',
    summary: 'Rename an application or replace its tags',
  })
  @ApiOkResponse({ type: ApplicationDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async update(
    @Param('project') project: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() body: UpdateApplicationDto,
  ): Promise<ApplicationDto> {
    const { id } = await this.projects.get(project);
    return this.applications.update(id, applicationId, body);
  }

  @Delete(':applicationId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteApplication',
    summary:
      'Delete an application with its API keys; telemetry is purged in the background',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async delete(
    @Param('project') project: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ): Promise<void> {
    const { id } = await this.projects.get(project);
    await this.applications.delete(id, applicationId);
  }
}
