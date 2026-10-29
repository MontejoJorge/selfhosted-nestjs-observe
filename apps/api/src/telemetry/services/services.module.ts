import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresServicesRepository } from './postgres-services.repository.js';
import { ServicesController } from './services.controller.js';
import { ServicesRepository } from './services.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [ServicesController],
  providers: [
    {
      provide: ServicesRepository,
      useClass: PostgresServicesRepository,
    },
  ],
})
export class ServicesModule {}
