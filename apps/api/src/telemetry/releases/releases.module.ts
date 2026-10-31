import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresReleasesRepository } from './postgres-releases.repository.js';
import { ReleasesController } from './releases.controller.js';
import { ReleasesRepository } from './releases.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [ReleasesController],
  providers: [
    { provide: ReleasesRepository, useClass: PostgresReleasesRepository },
  ],
})
export class ReleasesModule {}
