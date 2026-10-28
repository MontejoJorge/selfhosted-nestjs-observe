# selfhosted-nestjs-observe

Self-hosted collector and dashboard for [`@nestjs/observe`](https://www.npmjs.com/package/@nestjs/observe).
Keep your NestJS traces, jobs, errors, logs and metrics on your own infrastructure, with no plan limits.

> Status: early development. Not affiliated with the NestJS team.

## How it works

`@nestjs/observe` posts telemetry batches to a configurable collector. This project is that collector
(a NestJS API backed by PostgreSQL) plus a React dashboard to explore the data.

```ts
ObserveModule.forRoot({
  serviceId: 'orders-api',
  endpoint: 'http://your-collector:3000', // or set OBSERVE_ENDPOINT
});
```

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
