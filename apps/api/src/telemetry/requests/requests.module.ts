import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresRequestsRepository } from './postgres-requests.repository.js';
import { RequestsController } from './requests.controller.js';
import { RequestsRepository } from './requests.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [RequestsController],
  providers: [
    { provide: RequestsRepository, useClass: PostgresRequestsRepository },
  ],
  exports: [RequestsRepository],
})
export class RequestsModule {}
