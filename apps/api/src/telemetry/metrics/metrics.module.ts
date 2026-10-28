import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { MetricsRepository } from './metrics.repository.js';
import { PostgresMetricsRepository } from './postgres-metrics.repository.js';

@Module({
  controllers: [MetricsController],
  providers: [
    { provide: MetricsRepository, useClass: PostgresMetricsRepository },
  ],
})
export class MetricsModule {}
