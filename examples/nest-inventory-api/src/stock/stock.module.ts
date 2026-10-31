import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StockController } from './stock.controller.js';
import { StockRepository } from './stock.repository.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [StockController],
  providers: [StockRepository, StockService],
  exports: [StockRepository],
})
export class StockModule {}
