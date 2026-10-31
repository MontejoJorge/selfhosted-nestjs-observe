import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import { DEFAULT_RELEASE_WINDOW } from './release-comparison.js';
import { decodeReleaseCursor } from './release-cursor.js';
import {
  DEFAULT_RELEASE_PAGE_SIZE,
  MAX_VERSION_LENGTH,
  ReleaseDetailDto,
  ReleaseDetailQueryDto,
  ReleaseMarkerDto,
  ReleaseMarkersQueryDto,
  ReleasePageDto,
  ReleasesQueryDto,
} from './releases.dto.js';
import { ReleasesRepository } from './releases.repository.js';

/** Releases (ADR 0006). Markers live under their own path so no version shadows them. */
@ApiTags('releases')
@Controller()
export class ReleasesController {
  constructor(
    private readonly releases: ReleasesRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get('releases')
  @ApiOperation({
    operationId: 'listReleases',
    summary:
      'Releases whose boundary falls in the range (default 7d), newest first, with a before/after comparison',
  })
  @ApiOkResponse({ type: ReleasePageDto })
  async list(@Query() query: ReleasesQueryDto): Promise<ReleasePageDto> {
    return this.releases.list({
      scope: await this.scopes.resolve(query),
      range: resolveWindow({
        range: query.range ?? '7d',
        from: query.from,
        to: query.to,
      }),
      window: query.window ?? DEFAULT_RELEASE_WINDOW,
      limit: query.limit ?? DEFAULT_RELEASE_PAGE_SIZE,
      cursor: decodeReleaseCursor(query.cursor),
    });
  }

  @Get('release-markers')
  @ApiOperation({
    operationId: 'listReleaseMarkers',
    summary:
      'Release boundaries in the range (or the version switches of one instance), oldest first, for timelines',
  })
  @ApiOkResponse({ type: [ReleaseMarkerDto] })
  async markers(
    @Query() query: ReleaseMarkersQueryDto,
  ): Promise<ReleaseMarkerDto[]> {
    return this.releases.markers(
      await this.scopes.resolve(query),
      resolveWindow(query),
    );
  }

  @Get('releases/:version')
  @ApiOperation({
    operationId: 'getRelease',
    summary:
      'One release: comparison, per-operation and per-job impact, new error groups and instances',
  })
  @ApiParam({
    name: 'version',
    description: 'The service version (URL-encoded).',
  })
  @ApiOkResponse({ type: ReleaseDetailDto })
  @ApiBadRequestResponse({
    description:
      'Several applications of the project reported this version: pass `application`',
  })
  @ApiNotFoundResponse()
  async detail(
    @Param('version') version: string,
    @Query() query: ReleaseDetailQueryDto,
  ): Promise<ReleaseDetailDto> {
    if (version.length === 0 || version.length > MAX_VERSION_LENGTH)
      throw new BadRequestException('Invalid version');
    const scope = await this.scopes.resolve(query);
    const applications = await this.releases.applicationsWith(scope, version);
    if (applications.length > 1)
      throw new BadRequestException(
        `Version ${version} was reported by ${applications.length} applications: pass \`application\``,
      );
    const release =
      applications.length === 1
        ? await this.releases.detail(
            applications[0],
            version,
            query.window ?? DEFAULT_RELEASE_WINDOW,
          )
        : null;
    if (!release) throw new NotFoundException(`Release ${version} not found`);
    return release;
  }
}
