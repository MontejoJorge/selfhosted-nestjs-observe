import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresTimeBreakdownRepository } from './postgres-time-breakdown.repository.js';
import { TimeBreakdownController } from './time-breakdown.controller.js';
import { TimeBreakdownRepository } from './time-breakdown.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [TimeBreakdownController],
  providers: [
    {
      provide: TimeBreakdownRepository,
      useClass: PostgresTimeBreakdownRepository,
    },
  ],
})
export class TimeBreakdownModule {}
