import { Inject, Injectable } from '@nestjs/common';
import {
  APP_VERSION,
  ReleaseSource,
  type LatestRelease,
} from '../application/ports.js';

/**
 * Where the collector's releases are published, in order: the current repository, then
 * the name it may move to. A 404 (no release, or no repository) moves on to the next one.
 */
export const GITHUB_REPOSITORIES = [
  'MontejoJorge/selfhosted-nestjs-observe',
  'MontejoJorge/unofficial-selfhosted-nestjs-observe',
] as const;

const releasesPage = (repository: string) =>
  `https://github.com/${repository}/releases`;

/** Release page of a tag (`.../releases/tag/v1.1.0`) -> its repository's releases page. */
export function releasesPageOf(releaseUrl: string): string | null {
  const match = /^(https:\/\/github\.com\/[^/]+\/[^/]+\/releases)\/tag\//.exec(
    releaseUrl,
  );
  return match ? match[1] : null;
}

const TIMEOUT_MS = 10_000;

/**
 * Reads a `GET /repos/{owner}/{repo}/releases/latest` body. Throws when it doesn't look
 * like a release, so a changed or proxied answer is reported instead of stored.
 */
export function parseLatestRelease(body: unknown): LatestRelease {
  const release = (body ?? {}) as Record<string, unknown>;
  const { tag_name, html_url, published_at } = release;
  if (typeof tag_name !== 'string' || typeof html_url !== 'string')
    throw new Error('GitHub answered with something that is not a release');
  const publishedAt =
    typeof published_at === 'string' ? new Date(published_at) : null;
  return {
    version: tag_name,
    url: html_url,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  };
}

/**
 * Latest non-draft, non-prerelease GitHub release of the first repository that has one,
 * without a token (60 requests per hour per IP, far above two every 12 hours).
 */
@Injectable()
export class GithubReleaseSource extends ReleaseSource {
  constructor(@Inject(APP_VERSION) private readonly version: string) {
    super();
  }

  releasesUrl(latest: LatestRelease | null): string {
    return (
      (latest && releasesPageOf(latest.url)) ??
      releasesPage(GITHUB_REPOSITORIES[0])
    );
  }

  async latest(): Promise<LatestRelease | null> {
    for (const repository of GITHUB_REPOSITORIES) {
      const release = await this.latestOf(repository);
      if (release) return release;
    }
    return null;
  }

  /** Null on 404: nothing released there, or no such repository. */
  private async latestOf(repository: string): Promise<LatestRelease | null> {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `selfhosted-nestjs-observe/${this.version}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `GitHub answered ${response.status} ${response.statusText}`.trim(),
      );
    return parseLatestRelease(await response.json());
  }
}
