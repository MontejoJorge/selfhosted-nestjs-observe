import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresUsersRepository } from './postgres-users.repository.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [UsersController],
  providers: [{ provide: UsersRepository, useClass: PostgresUsersRepository }],
})
export class UsersModule {}
