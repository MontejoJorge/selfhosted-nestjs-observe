<p align="center">
  <img src="docs/assets/logo.svg" alt="" width="96" height="96" />
</p>

# selfhosted-nestjs-observe

Self-hosted collector and dashboard for [`@nestjs/observe`](https://www.npmjs.com/package/@nestjs/observe).
Keep your NestJS traces, jobs, errors, logs and metrics on your own infrastructure, with no plan limits.

> Status: early development. Not affiliated with the NestJS team.

## How it works

`@nestjs/observe` posts telemetry batches to a configurable collector. This project is that collector
(a NestJS API backed by PostgreSQL) plus a React dashboard to explore the data.

1. In the dashboard, create a **project** (e.g. one per environment), add an **application** for each Nest
   service, and create an **API key** for it. The secret is shown once.
2. Point the agent at the collector with that key:

```ts
ObserveModule.forRoot({
  serviceId: 'orders-api-1', // the instance; can repeat across environments
  endpoint: 'http://your-collector:3000', // or OBSERVE_ENDPOINT
  appKey: process.env.OBSERVE_APP_KEY,
  appSecret: process.env.OBSERVE_APP_SECRET,
});
```

Batches without a valid key and secret are rejected with `401`. The dashboard itself has no login yet, so
run it behind a VPN or an authenticating reverse proxy.

See [docs/protocol.md](docs/protocol.md) for the wire format and [docs/adr](docs/adr) for design decisions.

## Development

Requires Node 22+, pnpm 10 and Docker.

```sh
cp .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

| App             | URL                   |
| --------------- | --------------------- |
| API / collector | http://localhost:3000 |
| Dashboard       | http://localhost:5173 |

## License

[MIT](LICENSE)
