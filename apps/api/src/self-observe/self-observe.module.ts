import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import {
  SELF_OBSERVE_BOOT,
  SelfObserveRepository,
  type SelfObserveBoot,
} from './application/ports.js';
import { SelfObserve } from './application/self-observe.service.js';
import {
  bootSource,
  SelfCredentials,
  type StoredSelfObserve,
} from './domain/self-observe.js';
import { PostgresSelfObserveRepository } from './infrastructure/postgres-self-observe.repository.js';
import { SelfObserveController } from './self-observe.controller.js';

const logger = new Logger('SelfObserve');

/**
 * Reads the switch once, before the agent starts. Runs before the migrations, so on the
 * first boot after upgrading the table may not exist yet: that, or an unreachable
 * database, counts as off.
 */
async function resolveBoot(
  config: ConfigService<Env, true>,
  repository: SelfObserveRepository,
): Promise<SelfObserveBoot> {
  let stored: StoredSelfObserve | null = null;
  try {
    stored = await repository.get();
  } catch (error) {
    logger.warn(
      `Self-observe is off: could not read its switch (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const source = bootSource(
    {
      appKey: config.get('OBSERVE_APP_KEY', { infer: true }),
      appSecret: config.get('OBSERVE_APP_SECRET', { infer: true }),
    },
    stored,
  );
  return { source, credentials: SelfCredentials.generate() };
}

/**
 * Self-observe (ADR 0009): the dashboard's switch for the collector's own telemetry, the
 * boot decision the agent is configured with (`observe.ts`), and the ingest check of its
 * in-memory credentials. Global, so the agent's options and the ingest guard can use it.
 */
@Global()
@Module({
  controllers: [SelfObserveController],
  providers: [
    SelfObserve,
    {
      provide: SelfObserveRepository,
      useClass: PostgresSelfObserveRepository,
    },
    {
      provide: SELF_OBSERVE_BOOT,
      inject: [ConfigService, SelfObserveRepository],
      useFactory: resolveBoot,
    },
  ],
  exports: [SelfObserve, SELF_OBSERVE_BOOT],
})
export class SelfObserveSwitchModule {}
