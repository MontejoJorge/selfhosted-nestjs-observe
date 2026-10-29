import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { UserSummaryDto } from './dto/user-summary.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** A user's profile plus their posts, todos and carts, fetched in parallel. */
  @Get(':id/summary')
  getSummary(@Param('id', ParseIntPipe) id: number): Promise<UserSummaryDto> {
    return this.usersService.getSummary(id);
  }
}
