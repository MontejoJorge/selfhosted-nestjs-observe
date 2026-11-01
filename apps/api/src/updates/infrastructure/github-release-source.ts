import { Inject, Injectable } from '@nestjs/common';
import {
  APP_VERSION,
  ReleaseSource,
  type LatestRelease,
} from '../application/ports.js';

/** The collector's repository on GitHub, whose releases are the published versions. */
export const GITHUB_REPOSITORY = 'MontejoJorge/selfhosted-nestjs-observe';

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
 * Latest non-draft, non-prerelease GitHub release, without a token (60 requests per hour
 * per IP, far above one every 12 hours).
 */
@Injectable()
export class GithubReleaseSource extends ReleaseSource {
  readonly releasesUrl = `https://github.com/${GITHUB_REPOSITORY}/releases`;

  constructor(@Inject(APP_VERSION) private readonly version: string) {
    super();
  }

  async latest(): Promise<LatestRelease | null> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `selfhosted-nestjs-observe/${this.version}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    // No release published yet.
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `GitHub answered ${response.status} ${response.statusText}`.trim(),
      );
    return parseLatestRelease(await response.json());
  }
}
