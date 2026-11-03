import { ApiProperty } from '@nestjs/swagger';
import { TimeRangeQueryDto } from '../common/query.dto.js';

export const MAP_NODE_KINDS = [
  'client',
  'application',
  'queue',
  'database',
  'external',
] as const;
export type MapNodeKind = (typeof MAP_NODE_KINDS)[number];

export const MAP_NODE_UNITS = ['requests', 'jobs', 'queries', 'calls'] as const;
export type MapNodeUnit = (typeof MAP_NODE_UNITS)[number];

/** Scope and time range of the map; `instance` narrows the executions read. */
export class MapQueryDto extends TimeRangeQueryDto {}

/**
 * One box of the map. Ids are stable across calls: `clients`, `app:<applicationId>`,
 * `queue:<queue>`, `database:<applicationId>:<system>` and `external:<host>`.
 */
export class MapNodeDto {
  id: string;
  @ApiProperty({ enum: MAP_NODE_KINDS, enumName: 'MapNodeKind' })
  kind: MapNodeKind;
  /**
   * Application name, queue name, database system (`PostgreSQL`, `MySQL`, `SQL Server`,
   * `MongoDB`), outbound host (with its port, if any) or `Inbound traffic` for the client node.
   */
  label: string;
  /** Owning application: set on application and database nodes, null on shared ones. */
  @ApiProperty({ type: String, nullable: true })
  applicationId: string | null;
  /** Requests served (clients: requests from outside), jobs run, queries or calls made. */
  count: number;
  @ApiProperty({ enum: MAP_NODE_UNITS, enumName: 'MapNodeUnit' })
  unit: MapNodeUnit;
  /** Average duration (ms); null when unknown or nothing was counted. */
  @ApiProperty({ type: Number, nullable: true })
  avgMs: number | null;
  /** Share of the count that failed, ratio 0..1; null when nothing was counted. */
  @ApiProperty({ type: Number, nullable: true })
  errorRate: number | null;
}

/** A link between two nodes, by node id. */
export class MapEdgeDto {
  source: string;
  target: string;
  /**
   * True when the link comes from executions sharing a trace id (who enqueued a job,
   * which application called another), false when the data states it (a job's own
   * application, an outbound span).
   */
  inferred: boolean;
  /** Requests, jobs, queries or calls along the link (estimated when `sampled`). */
  count: number;
  /** Share of `count` that failed, ratio 0..1; null when `count` is 0. */
  @ApiProperty({ type: Number, nullable: true })
  errorRate: number | null;
}

export class MapDto {
  @ApiProperty({ type: [MapNodeDto] })
  nodes: MapNodeDto[];
  @ApiProperty({ type: [MapEdgeDto] })
  edges: MapEdgeDto[];
  /**
   * True when the trace-id inference only read the latest executions of the window
   * (5000 requests and 5000 jobs): the counts of inferred links, and of the links from
   * Clients, are then scaled up from that sample.
   */
  sampled: boolean;
}
