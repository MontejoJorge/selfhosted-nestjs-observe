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
  ApiTags,
} from '@nestjs/swagger';
import { ScopeResolver, type ScopeInput } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import {
  DEFAULT_USER_LIMIT,
  USER_ID_MAX_LENGTH,
  UserDetailDto,
  UserDetailQueryDto,
  UsersDto,
  UsersQueryDto,
} from './users.dto.js';
import { UsersRepository } from './users.repository.js';

const NO_INSTANCE =
  'The `instance` filter is not supported here: user stats are not kept per instance.';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listUsers',
    summary:
      'Users seen in the range, by request count, with an activity timeline',
    description:
      'Users are the ids reported by `http.getUserId`; requests without one are the ' +
      '`userId: null` row. The `instance` filter is not supported (400).',
  })
  @ApiOkResponse({ type: UsersDto })
  @ApiBadRequestResponse()
  async list(@Query() query: UsersQueryDto): Promise<UsersDto> {
    return this.users.list({
      scope: await this.resolve(query),
      window: resolveWindow(query),
      search: query.search,
      limit: query.limit ?? DEFAULT_USER_LIMIT,
    });
  }

  @Get(':userId')
  @ApiOperation({
    operationId: 'getUser',
    summary: "One user's stats and request timeline",
    description: 'The `instance` filter is not supported (400).',
  })
  @ApiOkResponse({ type: UserDetailDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'No requests from this user in range' })
  async detail(
    @Param('userId') userId: string,
    @Query() query: UserDetailQueryDto,
  ): Promise<UserDetailDto> {
    if (userId.length > USER_ID_MAX_LENGTH)
      throw new BadRequestException('User id is too long');
    const user = await this.users.findById(
      { scope: await this.resolve(query), window: resolveWindow(query) },
      userId,
    );
    if (!user)
      throw new NotFoundException(`User ${userId} has no requests in range`);
    return user;
  }

  private resolve(query: ScopeInput) {
    if (query.instance) throw new BadRequestException(NO_INSTANCE);
    return this.scopes.resolve(query);
  }
}
