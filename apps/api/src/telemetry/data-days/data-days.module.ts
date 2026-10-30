import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { DataDaysController } from './data-days.controller.js';
import { DataDaysRepository } from './data-days.repository.js';
import { PostgresDataDaysRepository } from './postgres-data-days.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [DataDaysController],
  providers: [
    { provide: DataDaysRepository, useClass: PostgresDataDaysRepository },
  ],
})
export class DataDaysModule {}
