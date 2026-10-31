# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, and others) working in this repository.

## What this is

A self-hosted collector and dashboard for [`@nestjs/observe`](https://www.npmjs.com/package/@nestjs/observe).
NestJS apps instrumented with `ObserveModule` point their `endpoint` (or `OBSERVE_ENDPOINT`) at our API,
which ingests the batches into PostgreSQL. The web app renders requests, jobs, errors, logs, traces and metrics.

## Layout

| Path               | What                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `apps/api`         | NestJS collector + query API ([apps/api/AGENTS.md](apps/api/AGENTS.md))  |
| `apps/web`         | Vite + React dashboard ([apps/web/AGENTS.md](apps/web/AGENTS.md))        |
| `docs/protocol.md` | The `@nestjs/observe` wire protocol. **Read it before touching ingest.** |
| `docs/adr/`        | Architecture decision records                                            |
| `.claude/skills/`  | Vendored agent skills (React and NestJS best practices and architecture) |

## Commands

Run from the repo root with pnpm (never npm or yarn).

```sh
pnpm install
pnpm db:up          # start PostgreSQL via docker compose
pnpm dev            # api + web in watch mode
pnpm build
pnpm lint
pnpm typecheck
pnpm test           # unit tests of both apps (Vitest)
pnpm format
```

Filter to one app with `pnpm --filter api <script>` or `pnpm --filter web <script>`.

## Rules

- Everything in the repo is in **English**: code, comments, commits, docs, UI copy.
- **Unit tests only**, with [Vitest](https://vitest.dev) in both apps. Specs are co-located with the code they
  cover and named `*.spec.ts` (`*.spec.tsx` for React hooks). They never need PostgreSQL, Docker or a running
  server: test pure modules directly and use cases with in-memory fakes of their ports. When a spec reveals a
  bug you are not fixing, keep it as `it.fails(...)` with a comment explaining the bug. Run `pnpm test`
  together with `pnpm typecheck` and `pnpm lint` before committing.
- Prettier config lives at the root (`.prettierrc`, with organize-imports). Run `pnpm format` before committing.
- Wire-format types live in `apps/api/src/ingest/domain/wire.ts`. The query API's shapes are the DTO classes in
  `apps/api` and reach the dashboard through `apps/api/openapi.json`.
- The API's ingest endpoints (`POST /applications/telemetry`, `POST /applications/profiles`) are a contract
  with a third-party agent. Never change their paths or response semantics without updating `docs/protocol.md`.
- Use [Conventional Commits](https://www.conventionalcommits.org) (`feat(api): ...`, `fix(web): ...`).
- Work on `develop`. `main` is for releases.

## CI

`.github/workflows/quality.yml` is a reusable workflow: lint, typecheck and test for each app plus
`format:check`, as matrix jobs. `ci.yml` runs it on pushes to `develop`/`main` and on pull requests;
`demo.yml` runs it before publishing the dashboard demo to GitHub Pages. Keep the four checks green.

## Skills

Load the matching skill before writing code:

- Backend: `nestjs-best-practices`, `clean-architecture`
- Database (schema, migrations, any SQL/Kysely query): `postgres-best-practices`
- Frontend: `react-best-practices`, `composition-patterns`

## MCP servers

`.mcp.json` declares `context7` (up-to-date library docs) and `playwright` (drive the dashboard in a
browser to verify UI changes). Approve them when your client asks.
