import { Module } from '@nestjs/common';
import { ApplicationPurger } from './application-purger.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  providers: [MaintenanceService, ApplicationPurger],
  exports: [ApplicationPurger],
})
export class MaintenanceModule {}
