import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { LogsController } from './logs.controller.js';
import { LogsRepository } from './logs.repository.js';
import { PostgresLogsRepository } from './postgres-logs.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [LogsController],
  providers: [{ provide: LogsRepository, useClass: PostgresLogsRepository }],
  exports: [LogsRepository],
})
export class LogsModule {}
