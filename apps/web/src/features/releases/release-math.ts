const COMMIT = /^[0-9a-f]{12,64}$/i;

/** Commit hashes read better short; other versions are shown as reported. */
export function shortVersion(version: string): string {
  return COMMIT.test(version) ? version.slice(0, 7) : version;
}

/** A release is one version of one application. */
export const releaseKey = (release: {
  applicationId: string;
  version: string;
}) => `${release.applicationId}/${release.version}`;
