import { Module } from '@nestjs/common';
import { ApplicationPurger } from './application-purger.js';
import { MaintenanceService } from './maintenance.service.js';
import { StorageTrimmer } from './storage-trimmer.js';

@Module({
  providers: [MaintenanceService, ApplicationPurger, StorageTrimmer],
  exports: [ApplicationPurger, StorageTrimmer],
})
export class MaintenanceModule {}
