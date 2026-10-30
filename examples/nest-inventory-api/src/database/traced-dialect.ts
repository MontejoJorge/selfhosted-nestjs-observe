import type { TracerService } from '@nestjs/observe';
import type {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  QueryResult,
} from 'kysely';

const MAX_STATEMENT_LENGTH = 2048;

/** Where each verb names the table it works on; anything else is named by its verb alone. */
const TABLE_AFTER: Record<string, RegExp> = {
  SELECT: /\bfrom\s+"?([\w.]+)"?/i,
  DELETE: /\bfrom\s+"?([\w.]+)"?/i,
  INSERT: /\binto\s+"?([\w.]+)"?/i,
  REPLACE: /\binto\s+"?([\w.]+)"?/i,
  UPDATE: /^\s*update\s+"?([\w.]+)"?/i,
};

/**
 * Wraps a Kysely dialect so every query runs inside a manual `@nestjs/observe`
 * span. The agent (0.3.20) instruments pg, mysql2, mssql and mongodb but not
 * SQLite, so without this the queries would not show up in traces.
 *
 * Spans are named like the agent names its SQL spans, `<VERB> <table>`
 * (`SELECT stock`, `INSERT reservations`), and tagged with `db.system` and
 * `db.statement`: the compiled SQL, whose values are `?` placeholders.
 */
export class TracedDialect implements Dialect {
  constructor(
    private readonly dialect: Dialect,
    private readonly tracer: TracerService,
  ) {}

  createDriver(): Driver {
    return new TracedDriver(this.dialect.createDriver(), this.tracer);
  }

  createQueryCompiler() {
    return this.dialect.createQueryCompiler();
  }

  createAdapter() {
    return this.dialect.createAdapter();
  }

  createIntrospector(...args: Parameters<Dialect['createIntrospector']>) {
    return this.dialect.createIntrospector(...args);
  }
}

class TracedDriver implements Driver {
  private readonly connections = new WeakMap<
    DatabaseConnection,
    DatabaseConnection
  >();

  constructor(
    private readonly driver: Driver,
    private readonly tracer: TracerService,
  ) {}

  init(...args: Parameters<Driver['init']>) {
    return this.driver.init(...args);
  }

  /** Hands out a traced wrapper; the driver gets its own connection back in every other call. */
  async acquireConnection(
    ...args: Parameters<Driver['acquireConnection']>
  ): Promise<DatabaseConnection> {
    const connection = await this.driver.acquireConnection(...args);
    let traced = this.connections.get(connection);
    if (!traced) {
      traced = new TracedConnection(connection, this.tracer);
      this.connections.set(connection, traced);
    }
    return traced;
  }

  beginTransaction(
    connection: DatabaseConnection,
    ...args: DropFirst<Parameters<Driver['beginTransaction']>>
  ) {
    // The driver runs `begin` on the connection it is given, so passing the
    // wrapper records BEGIN, COMMIT and ROLLBACK spans too.
    return this.driver.beginTransaction(connection, ...args);
  }

  commitTransaction(connection: DatabaseConnection) {
    return this.driver.commitTransaction(connection);
  }

  rollbackTransaction(connection: DatabaseConnection) {
    return this.driver.rollbackTransaction(connection);
  }

  async savepoint(
    ...args: Parameters<NonNullable<Driver['savepoint']>>
  ): Promise<void> {
    await this.driver.savepoint?.(...args);
  }

  async rollbackToSavepoint(
    ...args: Parameters<NonNullable<Driver['rollbackToSavepoint']>>
  ): Promise<void> {
    await this.driver.rollbackToSavepoint?.(...args);
  }

  async releaseSavepoint(
    ...args: Parameters<NonNullable<Driver['releaseSavepoint']>>
  ): Promise<void> {
    await this.driver.releaseSavepoint?.(...args);
  }

  releaseConnection(
    connection: DatabaseConnection,
    ...args: DropFirst<Parameters<Driver['releaseConnection']>>
  ) {
    const raw =
      connection instanceof TracedConnection ? connection.raw : connection;
    return this.driver.releaseConnection(raw, ...args);
  }

  destroy(...args: Parameters<Driver['destroy']>) {
    return this.driver.destroy(...args);
  }
}

class TracedConnection implements DatabaseConnection {
  constructor(
    readonly raw: DatabaseConnection,
    private readonly tracer: TracerService,
  ) {}

  executeQuery<R>(
    compiledQuery: CompiledQuery,
    ...args: DropFirst<Parameters<DatabaseConnection['executeQuery']>>
  ): Promise<QueryResult<R>> {
    const run = () => this.raw.executeQuery<R>(compiledQuery, ...args);
    const { operation, statement } = describeSql(compiledQuery.sql);
    return inSpan(this.tracer, operation, statement, run);
  }

  /** Streams are passed through untraced: a span would end before the rows are read. */
  streamQuery<R>(
    ...args: Parameters<DatabaseConnection['streamQuery']>
  ): AsyncIterableIterator<QueryResult<R>> {
    return this.raw.streamQuery<R>(...args);
  }
}

/**
 * Runs `query` inside a span. Outside a traced operation (startup migrations,
 * a sampled-out request) `createSpan` refuses before calling back, and the
 * query runs on its own. A query error rejects the span, which marks it
 * failed, and still reaches the caller.
 */
async function inSpan<T>(
  tracer: TracerService,
  name: string,
  statement: string,
  query: () => Promise<T>,
): Promise<T> {
  let started = false;
  try {
    return (await tracer.createSpan(name, (span) => {
      started = true;
      span.addTags({ 'db.system': 'sqlite', 'db.statement': statement });
      return query();
    })) as T;
  } catch (error) {
    if (started) throw error;
    return query();
  }
}

/** `select "on_hand" from "stock" where ...` -> `SELECT stock`. */
export function describeSql(sql: string): {
  operation: string;
  statement: string;
} {
  const statement = sql
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STATEMENT_LENGTH);
  const verb = /^[\s(]*([A-Za-z]+)/.exec(statement)?.[1]?.toUpperCase();
  if (!verb) return { operation: 'QUERY', statement };
  const table = TABLE_AFTER[verb]?.exec(statement)?.[1];
  return { operation: table ? `${verb} ${table}` : verb, statement };
}

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer Rest]
  ? Rest
  : never;
