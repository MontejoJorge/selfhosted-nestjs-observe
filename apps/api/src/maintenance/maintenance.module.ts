import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
