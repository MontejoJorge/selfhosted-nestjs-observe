/** The newest published release of the collector. */
export interface LatestRelease {
  /** The release tag, e.g. `v1.1.0`. */
  version: string;
  /** Release page. */
  url: string;
  publishedAt: Date | null;
}

/** Port: where the latest release is published (GitHub). */
export abstract class ReleaseSource {
  /** Page listing every release: the latest one's repository, else the current one. */
  abstract releasesUrl(latest: LatestRelease | null): string;
  /** Null when nothing has been released yet. Throws when the source can't be read. */
  abstract latest(): Promise<LatestRelease | null>;
}

export interface UpdateCheckState {
  /** The dashboard's switch (UPDATE_CHECK=false overrides it). */
  enabled: boolean;
  /** Result of the last successful check. */
  latest: LatestRelease | null;
  /** Last attempt, successful or not. */
  checkedAt: Date | null;
  /** Why the last attempt failed; null when it succeeded. */
  error: string | null;
}

/** Port: the stored switch and last result. */
export abstract class UpdateCheckRepository {
  abstract get(): Promise<UpdateCheckState>;
  abstract setEnabled(enabled: boolean): Promise<void>;
  /** A successful check: replaces the latest release and clears the error. */
  abstract saveLatest(
    latest: LatestRelease | null,
    checkedAt: Date,
  ): Promise<void>;
  /** A failed check: keeps the previous latest release. */
  abstract saveFailure(error: string, checkedAt: Date): Promise<void>;
}

/** Injection token for the running collector's version (`apps/api/package.json`). */
export const APP_VERSION = Symbol('APP_VERSION');
