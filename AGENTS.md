# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, and others) working in this repository.

## What this is

A self-hosted collector and dashboard for [`@nestjs/observe`](https://www.npmjs.com/package/@nestjs/observe).
NestJS apps instrumented with `ObserveModule` point their `endpoint` (or `OBSERVE_ENDPOINT`) at our API,
which ingests the batches into PostgreSQL. The web app renders requests, jobs, errors, logs, traces and metrics.

## Layout

| Path                 | What                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | NestJS collector + query API ([apps/api/AGENTS.md](apps/api/AGENTS.md))  |
| `apps/web`           | Vite + React dashboard ([apps/web/AGENTS.md](apps/web/AGENTS.md))        |
| `packages/contracts` | Shared TypeScript types: decoded wire format and query API DTOs          |
| `docs/protocol.md`   | The `@nestjs/observe` wire protocol. **Read it before touching ingest.** |
| `docs/adr/`          | Architecture decision records                                            |
| `.claude/skills/`    | Vendored agent skills (React and NestJS best practices and architecture) |

## Commands

Run from the repo root with pnpm (never npm or yarn).

```sh
pnpm install
pnpm db:up          # start PostgreSQL via docker compose
pnpm dev            # api + web in watch mode
pnpm build
pnpm lint
pnpm typecheck
pnpm format
```

Filter to one app with `pnpm --filter api <script>` or `pnpm --filter web <script>`.

## Rules

- Everything in the repo is in **English**: code, comments, commits, docs, UI copy.
- **No tests for now.** Do not add test files, test runners or test dependencies until the maintainer asks.
- Prettier config lives at the root (`.prettierrc`, with organize-imports). Run `pnpm format` before committing.
- Wire-format types live in `packages/contracts`. Change them there, never by duplicating them in an app.
- The API's ingest endpoints (`POST /applications/telemetry`, `POST /applications/profiles`) are a contract
  with a third-party agent. Never change their paths or response semantics without updating `docs/protocol.md`.
- Use [Conventional Commits](https://www.conventionalcommits.org) (`feat(api): ...`, `fix(web): ...`).
- Work on `develop`. `main` is for releases.

## Skills

Load the matching skill before writing code:

- Backend: `nestjs-best-practices`, `clean-architecture`
- Frontend: `react-best-practices`, `composition-patterns`

## MCP servers

`.mcp.json` declares `context7` (up-to-date library docs) and `playwright` (drive the dashboard in a
browser to verify UI changes). Approve them when your client asks.
