import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Names of what the switch creates: they say the telemetry is the collector's own. */
export const SELF_PROJECT_NAME = 'Self';
export const SELF_PROJECT_DESCRIPTION =
  "This collector's own requests, jobs, errors, logs and runtime metrics (self-observe).";
export const SELF_APPLICATION_NAME = 'collector (self)';

/**
 * Where the collector's own agent gets its credentials, decided at boot:
 * - `env`: OBSERVE_APP_KEY / OBSERVE_APP_SECRET, an API key like any other application's;
 * - `self`: the dashboard's switch, with credentials generated in memory;
 * - `off`: the agent is disabled.
 */
export const SELF_OBSERVE_SOURCES = ['off', 'self', 'env'] as const;
export type SelfObserveSource = (typeof SELF_OBSERVE_SOURCES)[number];

export interface StoredSelfObserve {
  enabled: boolean;
  /** Null until the switch is first turned on, or after its application was deleted. */
  applicationId: string | null;
}

/** Whether the stored switch asks for self mode (it needs an application to report to). */
export const wantsSelf = (stored: StoredSelfObserve | null): boolean =>
  stored !== null && stored.enabled && stored.applicationId !== null;

/** The agent's source at boot: env credentials win over the switch. */
export function bootSource(
  env: { appKey?: string; appSecret?: string },
  stored: StoredSelfObserve | null,
): SelfObserveSource {
  if (env.appKey && env.appSecret) return 'env';
  return wantsSelf(stored) ? 'self' : 'off';
}

/**
 * The agent only reads its options at boot, so a switch changed since then takes effect
 * after a restart. Env credentials ignore the switch.
 */
export function restartRequired(
  source: SelfObserveSource,
  stored: StoredSelfObserve,
): boolean {
  if (source === 'env') return false;
  return wantsSelf(stored) !== (source === 'self');
}

/**
 * Ingest credentials of the collector's own agent in self mode: random per process and
 * never stored, so there is no API key to create, show or leak.
 */
export class SelfCredentials {
  private constructor(
    readonly appKey: string,
    readonly appSecret: string,
  ) {}

  static generate(): SelfCredentials {
    return new SelfCredentials(
      `self_${randomBytes(18).toString('base64url')}`,
      `selfs_${randomBytes(32).toString('base64url')}`,
    );
  }

  /** Constant-time check of presented credentials. */
  matches(appKey: string | undefined, appSecret: string | undefined): boolean {
    return (
      appKey === this.appKey &&
      appSecret !== undefined &&
      equal(appSecret, this.appSecret)
    );
  }
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
