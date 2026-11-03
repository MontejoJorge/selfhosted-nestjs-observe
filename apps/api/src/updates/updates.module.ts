import { Module } from '@nestjs/common';
import {
  APP_VERSION,
  ReleaseSource,
  UpdateCheckRepository,
} from './application/ports.js';
import { UpdateChecker } from './application/update-checker.js';
import { readAppVersion } from './infrastructure/app-version.js';
import { GithubReleaseSource } from './infrastructure/github-release-source.js';
import { PostgresUpdateCheckRepository } from './infrastructure/postgres-update-check.repository.js';
import { UpdatesController } from './updates.controller.js';

/**
 * Update check (ADR 0008): the latest GitHub release against the running version, every
 * 6 hours, under /api/updates. Off with UPDATE_CHECK=false or the dashboard's switch.
 */
@Module({
  controllers: [UpdatesController],
  providers: [
    UpdateChecker,
    { provide: APP_VERSION, useFactory: () => readAppVersion() },
    { provide: ReleaseSource, useClass: GithubReleaseSource },
    { provide: UpdateCheckRepository, useClass: PostgresUpdateCheckRepository },
  ],
})
export class UpdatesModule {}
