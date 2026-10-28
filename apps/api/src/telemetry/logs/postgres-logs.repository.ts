import { Inject, Injectable } from '@nestjs/common';
import type { LogItem, LogLevel, Page } from '@selfhosted-observe/contracts';
import type { Selectable } from 'kysely';
import {
  KYSELY,
  type Db,
  type LogsTable,
} from '../../database/database.types.js';
import { toPage, type KeysetCursor } from '../common/cursor.js';
import { likeContains } from '../common/sql.js';
import { LogsRepository, type LogFilter } from './logs.repository.js';

const COLUMNS = [
  'id',
  'timestamp',
  'service_id',
  'level',
  'context',
  'text',
  'trace_id',
  'span_id',
  'attributes',
] as const;

/** Max log lines returned for one trace id. */
const TRACE_LIMIT = 1000;

type Row = Pick<Selectable<LogsTable>, (typeof COLUMNS)[number]>;

@Injectable()
export class PostgresLogsRepository extends LogsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async list(
    filter: LogFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<LogItem>> {
    let query = this.db
      .selectFrom('logs')
      .select(COLUMNS)
      .where('timestamp', '>=', filter.window.from)
      .where('timestamp', '<', filter.window.to);
    if (filter.serviceId)
      query = query.where('service_id', '=', filter.serviceId);
    if (filter.level) query = query.where('level', '=', filter.level);
    if (filter.traceId) query = query.where('trace_id', '=', filter.traceId);
    if (filter.context) query = query.where('context', '=', filter.context);
    if (filter.q) query = query.where('text', 'ilike', likeContains(filter.q));
    const { cursor } = page;
    if (cursor) {
      query = query.where((eb) =>
        eb(eb.refTuple('timestamp', 'id'), '<', eb.tuple(cursor.t, cursor.id)),
      );
    }
    const rows = await query
      .orderBy('timestamp', 'desc')
      .orderBy('id', 'desc')
      .limit(page.limit + 1)
      .execute();
    return toPage(
      rows,
      page.limit,
      (row) => ({ t: row.timestamp, id: row.id }),
      toLogItem,
    );
  }

  async findByTraceId(traceId: string): Promise<LogItem[]> {
    const rows = await this.db
      .selectFrom('logs')
      .select(COLUMNS)
      .where('trace_id', '=', traceId)
      .orderBy('timestamp')
      .orderBy('id')
      .limit(TRACE_LIMIT)
      .execute();
    return rows.map(toLogItem);
  }
}

function toLogItem(row: Row): LogItem {
  return {
    id: row.id,
    serviceId: row.service_id,
    timestamp: row.timestamp.toISOString(),
    level: row.level as LogLevel | null,
    context: row.context,
    text: row.text,
    traceId: row.trace_id,
    spanId: row.span_id,
    attributes: (row.attributes as Record<string, unknown> | null) ?? null,
  };
}
