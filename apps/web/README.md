# web

The dashboard for the self-hosted `@nestjs/observe` collector: overview KPIs, requests and jobs with
trace waterfalls, grouped errors, logs, traces and runtime/custom metrics. It reads the query API
served by [`apps/api`](../api).

## Run

```sh
pnpm install
pnpm --filter @selfhosted-observe/contracts build
pnpm --filter web dev
```

Open http://localhost:5173. The API base URL comes from `VITE_API_URL` (default
`http://localhost:3000`); set it in `apps/web/.env.local` if the collector runs elsewhere. The API
must allow the dashboard's origin in its CORS settings.

To get data, point an instrumented NestJS app at the collector:

```sh
OBSERVE_ENDPOINT=http://localhost:3000
```

## Scripts

| Script      | What                    |
| ----------- | ----------------------- |
| `dev`       | Vite dev server         |
| `build`     | type-check + production |
| `typecheck` | `tsc -b --noEmit`       |
| `lint`      | oxlint                  |
| `preview`   | serve the built `dist`  |

Built with Vite, React 19, TanStack Router and Query, Tailwind CSS v4, shadcn/ui and Recharts.
See [AGENTS.md](AGENTS.md) for structure and conventions.
