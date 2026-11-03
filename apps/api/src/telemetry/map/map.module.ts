import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { MapController } from './map.controller.js';
import { MapRepository } from './map.repository.js';
import { PostgresMapRepository } from './postgres-map.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [MapController],
  providers: [{ provide: MapRepository, useClass: PostgresMapRepository }],
})
export class MapModule {}
