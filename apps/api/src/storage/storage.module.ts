import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ScopeModule } from '../telemetry/common/scope.module.js';
import {
  PostgresStorageRepository,
  PostgresStorageTrimQueue,
} from './postgres-storage.repository.js';
import { StorageController } from './storage.controller.js';
import { StorageRepository, StorageTrimQueue } from './storage.repository.js';
import { StorageService } from './storage.service.js';

/**
 * Storage usage (database, tables, partitions, projects and applications) and trims of old
 * raw telemetry, under /api/storage and /api/projects/:project/storage. Trims run in the
 * background in `StorageTrimmer` (maintenance).
 */
@Module({
  imports: [ScopeModule, MaintenanceModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    { provide: StorageRepository, useClass: PostgresStorageRepository },
    { provide: StorageTrimQueue, useClass: PostgresStorageTrimQueue },
  ],
})
export class StorageModule {}
