import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller.js';
import { LogsRepository } from './logs.repository.js';
import { PostgresLogsRepository } from './postgres-logs.repository.js';

@Module({
  controllers: [LogsController],
  providers: [{ provide: LogsRepository, useClass: PostgresLogsRepository }],
  exports: [LogsRepository],
})
export class LogsModule {}
