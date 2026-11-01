# ADR 0008: Update check against GitHub releases

- Status: accepted
- Date: 2026-11-01

## Context

Self-hosted collectors are rarely watched: nothing tells an operator that a newer version is out. The
repository's `v*` tags publish the Docker image, but there were no GitHub releases to compare with.

## Decision

**Releases.** The `Docker image` workflow gets a `release` job on tag pushes: it fails when the tag is
not `v` + `apps/api/package.json`'s version, then creates the GitHub release with the tag's
`CHANGELOG.md` section as notes (generated notes when there is none). The API's `package.json`
version is therefore the running version, read at boot from the nearest `package.json` above the
compiled module (`/app/package.json` in the image).

**Who asks GitHub.** The API, not the browser: one request per collector instead of one per viewer,
and the result is stored, so the dashboard reads it without leaving the network.
`GET https://api.github.com/repos/MontejoJorge/selfhosted-nestjs-observe/releases/latest` (no token: 60
requests per hour per IP; drafts and pre-releases are left out by GitHub), 10 s timeout. The owner and
repositories live in one constant (`GITHUB_REPOSITORIES`); GitHub redirects renamed repositories.

**When.** An hourly cron (`@nestjs/schedule`, like maintenance) and the boot run a check only when the
last attempt is at least 12 hours old, so restarts don't add requests. A failed attempt waits 12 hours
too and is shown with its error; the previous result is kept. "Check now" (`POST /api/updates/check`)
asks at once.

**404.** `releases/latest` answers 404 both when nothing is released and when the repository is gone.
The check then asks the next repository of the list, `MontejoJorge/unofficial-selfhosted-nestjs-observe`
(the name the project may move to), and links to the releases page of whichever answered. When both
answer 404 there is nothing to announce: the stored result is cleared, so no update link is shown, and
the settings page says "No release found". The check keeps running every 12 hours, which is harmless;
the operator can turn it off. Any other error stops at the repository that gave it.

**State.** `update_check`, a single-row table (`id = 1`, inserted by migration 0013): the switch and
the last result (`latest_version`, `latest_url`, `latest_published_at`, `checked_at`, `error`).

**Turning it off.** `UPDATE_CHECK=false` stops every request and locks the switch (409 on change).
Otherwise the dashboard's switch (`PATCH /api/updates/settings`) turns it on or off; turning it on
checks right away when a check is due. While off, a stored newer release is not announced.

**Dashboard.** The sidebar shows the running version and, when `updateAvailable`, a small link to the
release page. The Collector settings page (`/settings`, in the rail) has the switch, the latest
release, the last check and its error. The demo answers these routes in memory and never calls GitHub.

## Consequences

- Releasing means bumping `apps/api/package.json` (with the root and web ones) before tagging, or the
  release job fails after the image is pushed.
- Collectors without internet access log a warning every 12 hours until `UPDATE_CHECK=false`.
