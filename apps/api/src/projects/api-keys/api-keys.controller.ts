import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import type {
  ApiKey,
  CreatedApiKey,
  Page,
} from '@selfhosted-observe/contracts';
import { decodeCursor, UUID_ID } from '../../telemetry/common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../../telemetry/common/query.dto.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  ApiKeyDto,
  ApiKeyPageDto,
  ApiKeysQueryDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from './api-keys.dto.js';
import { ApiKeysRepository } from './api-keys.repository.js';
import { ApiKeysService } from './api-keys.service.js';

/** `:project` is the project id or slug; `:keyId` is the key's `id` (UUID), not its public key id. */
@ApiTags('api-keys')
@Controller('projects/:project/keys')
export class ApiKeysController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly keys: ApiKeysService,
    private readonly repository: ApiKeysRepository,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listApiKeys',
    summary: 'API keys of a project, newest first (secrets are never returned)',
  })
  @ApiOkResponse({ type: ApiKeyPageDto })
  @ApiNotFoundResponse()
  async list(
    @Param('project') project: string,
    @Query() query: ApiKeysQueryDto,
  ): Promise<Page<ApiKey>> {
    const { id } = await this.projects.get(project);
    return this.repository.list(
      id,
      { applicationId: query.applicationId },
      {
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        cursor: decodeCursor(query.cursor, UUID_ID),
      },
    );
  }

  @Post()
  @ApiOperation({
    operationId: 'createApiKey',
    summary:
      'Create an API key for an application; the response carries the secret, shown only once',
  })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  @ApiNotFoundResponse()
  async create(
    @Param('project') project: string,
    @Body() body: CreateApiKeyDto,
  ): Promise<CreatedApiKey> {
    const { id } = await this.projects.get(project);
    return this.keys.create(id, body);
  }

  @Post(':keyId/revoke')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'revokeApiKey',
    summary: 'Revoke an API key: ingest with it is rejected from now on',
  })
  @ApiOkResponse({ type: ApiKeyDto })
  @ApiNotFoundResponse()
  async revoke(
    @Param('project') project: string,
    @Param('keyId', new ParseUUIDPipe()) keyId: string,
  ): Promise<ApiKey> {
    const { id } = await this.projects.get(project);
    return this.keys.revoke(id, keyId);
  }

  @Delete(':keyId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteApiKey', summary: 'Delete an API key' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async delete(
    @Param('project') project: string,
    @Param('keyId', new ParseUUIDPipe()) keyId: string,
  ): Promise<void> {
    const { id } = await this.projects.get(project);
    await this.keys.delete(id, keyId);
  }
}
