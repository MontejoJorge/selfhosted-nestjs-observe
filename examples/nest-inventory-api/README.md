<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Telemetry endpoints

These endpoints exist to generate interesting telemetry. They call free public APIs ([DummyJSON](https://dummyjson.com) and [PokéAPI](https://pokeapi.co)) with `fetch`, so each trace shows a span per service method plus one per outbound HTTP call. Each lives in its own feature module: `src/users`, `src/pokemon` and `src/catalog`. Replace `34240` with your `API_PORT`.

| Method | Path                      | What it does                                                                                                                                                                                                                |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/users/:id/summary`      | Fetches a DummyJSON user, then their posts, todos and carts in parallel, and aggregates them. An unknown id returns 404.                                                                                                    |
| `GET`  | `/pokemon/:name/matchups` | Fetches a pokemon, then each of its types in parallel, and computes weaknesses, resistances and immunities. An unknown name returns 404.                                                                                    |
| `GET`  | `/catalog/insights`       | Validates `?categories=` (default `smartphones,laptops,tablets`; unknown ones return 400), fetches each category's products in parallel, ranks them and runs a slow pricing step. `?fail=true` makes that step throw (500). |

```bash
$ curl http://localhost:34240/users/5/summary
$ curl http://localhost:34240/users/99999/summary            # 404
$ curl http://localhost:34240/pokemon/charizard/matchups
$ curl http://localhost:34240/pokemon/notapokemon/matchups   # 404
$ curl "http://localhost:34240/catalog/insights?categories=laptops,tablets"
$ curl "http://localhost:34240/catalog/insights?fail=true"   # 500
```

Upstream responses are cached in memory for 60 s (`src/common/http/get-json.ts`), so the generated load does not hammer the public APIs.

## Local database (SQLite)

`src/stock` keeps local stock levels and reservations in a SQLite file, queried with [Kysely](https://kysely.dev) and its built-in `SqliteDialect` over `better-sqlite3`. The file lives at `SQLITE_FILE` (default `data/inventory.sqlite`, git-ignored); its directory and tables are created on startup, and the first 30 products are seeded with stock.

| Method | Path                             | What it does                                                                                                                                                     |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/stock/:productId`              | A product's units on hand, reserved and available. An unknown product returns 404.                                                                               |
| `GET`  | `/stock/low`                     | The 10 products with the fewest units available.                                                                                                                 |
| `POST` | `/stock/:productId/reservations` | Body `{ "quantity": 1-50 }`. In one transaction, checks availability, inserts a reservation (with the `x-user-id` header) and updates the stock. 409 when short. |

```bash
$ curl http://localhost:34240/stock/3
$ curl -X POST -H 'content-type: application/json' -d '{"quantity":2}' http://localhost:34240/stock/3/reservations
```

`@nestjs/observe` 0.3.20 traces `pg`, `mysql2`, `mssql` and `mongodb` queries on its own, but not SQLite. So `src/database/traced-dialect.ts` wraps the Kysely dialect and runs every query in a manual span (`TracerService.createSpan`), named like the agent's SQL spans - `SELECT stock`, `INSERT reservations`, `BEGIN` - and tagged with `db.system: sqlite` and `db.statement` (the compiled SQL, values as `?` placeholders). A failing query fails its span. Repositories use Kysely as usual and never see the spans.

## Scheduled jobs

`src/jobs` has two `@nestjs/schedule` cron jobs, traced as jobs:

- `featured-pokemon` (every minute): fetches 3 to 5 random pokemon in parallel and ranks them by base stats.
- `inventory-reconcile` (every minute, at second 30): fetches a page of products, upserts their stock into SQLite, releases reservations older than 2 minutes, finds low stock and "saves" a report to a slow warehouse API that fails 20% of the time.

## Generated load

On startup the app calls its own endpoints (`src/load`) so the dashboard fills up: a base rate that drifts along a slow wave, random bursts, and a share of failing requests (404, 400 and 500). It logs its counters every 30 s. About 80% of the requests carry an `x-user-id` header from a fixed pool of 14 users, a few of them much busier than the rest (`src/load/user-pool.ts`); the rest stay anonymous. The app reports that header as the request's user id through `http.getUserId` in `src/app.module.ts`. Tune or disable it in `src/load/load.config.ts`:

| Setting              | Default      | What                                         |
| -------------------- | ------------ | -------------------------------------------- |
| `enabled`            | `true`       | Turn the generator off.                      |
| `durationMinutes`    | `0`          | Stop after N minutes; `0` runs forever.      |
| `baseRps`            | `3`          | Average requests per second outside bursts.  |
| `wave`               | `6 min, 0.7` | Period and amplitude of the slow drift.      |
| `burst.everySeconds` | `45–150`     | Time between bursts.                         |
| `burst.lastsSeconds` | `5–25`       | Length of a burst.                           |
| `burst.rps`          | `15–40`      | Requests per second during a burst.          |
| `errorRate`          | `0.12`       | Share of requests meant to fail.             |
| `maxInFlight`        | `60`         | Concurrent requests; extra ones are skipped. |

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
