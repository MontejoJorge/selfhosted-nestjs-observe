import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [StockModule],
  providers: [JobsService],
})
export class JobsModule {}
