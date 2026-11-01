import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { restartRequired } from '../domain/self-observe.js';
import type { SelfObserveStatusDto } from '../self-observe.dto.js';
import {
  SELF_OBSERVE_BOOT,
  SelfObserveRepository,
  type SelfObserveBoot,
} from './ports.js';

/**
 * Self-observe (ADR 0009): the collector reports its own telemetry to an "Observe collector (self)" project
 * without any API key. The switch is read when the agent starts, so changing it takes
 * effect after a restart; turning it off stops accepting the collector's own batches
 * right away.
 */
@Injectable()
export class SelfObserve {
  constructor(
    private readonly repository: SelfObserveRepository,
    @Inject(SELF_OBSERVE_BOOT) private readonly boot: SelfObserveBoot,
  ) {}

  /**
   * Application of the collector's own ingest batches, or null when the credentials are
   * not its self-mode ones or the switch was turned off since boot.
   */
  async applicationFor(
    appKey: string | undefined,
    appSecret: string | undefined,
  ): Promise<string | null> {
    if (
      this.boot.source !== 'self' ||
      !this.boot.credentials.matches(appKey, appSecret)
    )
      return null;
    const stored = await this.repository.get();
    return stored.enabled ? stored.applicationId : null;
  }

  async status(): Promise<SelfObserveStatusDto> {
    const stored = await this.repository.get();
    return {
      enabled: stored.enabled,
      source: this.boot.source,
      restartRequired: restartRequired(this.boot.source, stored),
      projectSlug: stored.target?.projectSlug ?? null,
      projectName: stored.target?.projectName ?? null,
      applicationName: stored.target?.applicationName ?? null,
    };
  }

  async setEnabled(enabled: boolean): Promise<SelfObserveStatusDto> {
    if (this.boot.source === 'env')
      throw new ConflictException(
        'The collector reports with OBSERVE_APP_KEY and OBSERVE_APP_SECRET',
      );
    if (enabled) await this.repository.enable();
    else await this.repository.disable();
    return this.status();
  }
}
