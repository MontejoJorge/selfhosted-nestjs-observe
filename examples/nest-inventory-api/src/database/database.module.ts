import { Module } from '@nestjs/common';
import { InventoryDatabase } from './inventory-database.js';

@Module({
  providers: [InventoryDatabase],
  exports: [InventoryDatabase],
})
export class DatabaseModule {}
