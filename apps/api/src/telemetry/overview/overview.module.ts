import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';
import { PostgresOverviewRepository } from './postgres-overview.repository.js';

@Module({
  controllers: [OverviewController],
  providers: [
    { provide: OverviewRepository, useClass: PostgresOverviewRepository },
  ],
})
export class OverviewModule {}
