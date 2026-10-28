import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { InstancesController } from './instances.controller.js';
import { InstancesRepository } from './instances.repository.js';
import { PostgresInstancesRepository } from './postgres-instances.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [InstancesController],
  providers: [
    { provide: InstancesRepository, useClass: PostgresInstancesRepository },
  ],
})
export class InstancesModule {}
