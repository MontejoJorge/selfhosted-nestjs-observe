import type {
  SelfCredentials,
  SelfObserveSource,
  StoredSelfObserve,
} from '../domain/self-observe.js';

export interface SelfObserveState extends StoredSelfObserve {
  /** Names of `applicationId` and its project, for the dashboard's link. */
  target: {
    projectSlug: string;
    projectName: string;
    applicationName: string;
  } | null;
}

/** Port: the stored switch and the application it reports to. */
export abstract class SelfObserveRepository {
  abstract get(): Promise<SelfObserveState>;
  /**
   * Turns the switch on, first creating the "Self" project and its application when there
   * is none (never seen, or deleted since), in one transaction.
   */
  abstract enable(): Promise<void>;
  abstract disable(): Promise<void>;
}

/** How the collector's own agent was configured at boot. */
export interface SelfObserveBoot {
  source: SelfObserveSource;
  /** Used by the agent and accepted by ingest only when `source` is `self`. */
  credentials: SelfCredentials;
}

/** Injection token for `SelfObserveBoot`, resolved once before the agent starts. */
export const SELF_OBSERVE_BOOT = Symbol('SELF_OBSERVE_BOOT');
