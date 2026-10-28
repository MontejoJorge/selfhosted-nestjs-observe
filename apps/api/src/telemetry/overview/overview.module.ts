import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';
import { PostgresOverviewRepository } from './postgres-overview.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [OverviewController],
  providers: [
    { provide: OverviewRepository, useClass: PostgresOverviewRepository },
  ],
})
export class OverviewModule {}
