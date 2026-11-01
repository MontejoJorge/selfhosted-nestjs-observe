import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../../config/env.js';
import { isCheckDue } from '../domain/check-schedule.js';
import { isNewer } from '../domain/version.js';
import type { UpdateStatusDto } from '../updates.dto.js';
import {
  APP_VERSION,
  ReleaseSource,
  UpdateCheckRepository,
  type UpdateCheckState,
} from './ports.js';

/**
 * Looks up the latest release of the collector every 12 hours (ADR 0008). An hourly tick
 * checks when the last attempt is 12 hours old, so restarts don't add requests to GitHub.
 * A failed attempt waits 12 hours too; "check now" retries at once. UPDATE_CHECK=false
 * turns it off for good; otherwise the dashboard's switch does.
 */
@Injectable()
export class UpdateChecker implements OnApplicationBootstrap {
  private readonly logger = new Logger(UpdateChecker.name);
  private readonly allowedByEnv: boolean;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly repository: UpdateCheckRepository,
    private readonly source: ReleaseSource,
    @Inject(APP_VERSION) private readonly currentVersion: string,
    config: ConfigService<Env, true>,
  ) {
    this.allowedByEnv = config.get('UPDATE_CHECK', { infer: true });
  }

  onApplicationBootstrap(): void {
    // In the background: GitHub being slow or unreachable must not hold the boot.
    void this.scheduled();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduled(): Promise<void> {
    try {
      await this.checkIfDue(new Date());
    } catch (error) {
      this.logger.error(
        'Update check failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async checkIfDue(now: Date): Promise<void> {
    if (!this.allowedByEnv) return;
    const state = await this.repository.get();
    if (state.enabled && isCheckDue(state.checkedAt, now)) await this.check();
  }

  async status(): Promise<UpdateStatusDto> {
    return this.toDto(await this.repository.get());
  }

  /** Turns the switch on or off; turning it on checks right away when a check is due. */
  async setEnabled(enabled: boolean): Promise<UpdateStatusDto> {
    this.assertAllowedByEnv();
    await this.repository.setEnabled(enabled);
    if (enabled) await this.checkIfDue(new Date());
    return this.status();
  }

  /** Checks now, whenever the last check was. */
  async checkNow(): Promise<UpdateStatusDto> {
    this.assertAllowedByEnv();
    const state = await this.repository.get();
    if (!state.enabled)
      throw new ConflictException('The update check is turned off');
    await this.check();
    return this.status();
  }

  private assertAllowedByEnv(): void {
    if (!this.allowedByEnv)
      throw new ConflictException(
        'The update check is turned off by UPDATE_CHECK=false',
      );
  }

  /** One lookup at a time: concurrent callers share it. */
  private check(): Promise<void> {
    this.inFlight ??= this.lookUp().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async lookUp(): Promise<void> {
    try {
      const latest = await this.source.latest();
      await this.repository.saveLatest(latest, new Date());
      if (latest && isNewer(latest.version, this.currentVersion))
        this.logger.log(
          `Version ${latest.version} is available (running ${this.currentVersion}): ${latest.url}`,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not look up the latest release: ${message}`);
      await this.repository.saveFailure(message, new Date());
    }
  }

  private toDto(state: UpdateCheckState): UpdateStatusDto {
    const { latest } = state;
    const enabled = this.allowedByEnv && state.enabled;
    return {
      currentVersion: this.currentVersion,
      enabled,
      disabledByEnv: !this.allowedByEnv,
      latestVersion: latest?.version ?? null,
      latestUrl: latest?.url ?? null,
      latestPublishedAt: latest?.publishedAt?.toISOString() ?? null,
      // A stored result is not announced once the check is off.
      updateAvailable:
        enabled &&
        latest !== null &&
        isNewer(latest.version, this.currentVersion),
      releasesUrl: this.source.releasesUrl,
      checkedAt: state.checkedAt?.toISOString() ?? null,
      error: state.error,
    };
  }
}
