import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import type {
  Percentiles,
  Primitive,
  TimeBucket,
  TraceSpan,
  WireError,
} from '@selfhosted-observe/contracts';

/** Shared response DTOs. Classes (not interfaces) so they appear in the OpenAPI spec. */

/** OpenAPI schema for `Record<string, string | number | boolean>`. */
export const TAGS_SCHEMA: ApiPropertyOptions = {
  type: 'object',
  additionalProperties: {
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  },
};

/** OpenAPI schema for a free-form JSON object. */
export const JSON_OBJECT_SCHEMA: ApiPropertyOptions = {
  type: 'object',
  additionalProperties: true,
};

export class PercentilesDto implements Percentiles {
  p50: number;
  p95: number;
  p99: number;
  /** Mean. */
  avg: number;
}

export class TimeBucketDto implements TimeBucket {
  /** Bucket start (ISO). */
  t: string;
  count: number;
  errors: number;
  p95: number;
  /** Mean duration (ms). */
  avg: number;
  /** Requests with statusCode 400-499 (always 0 for jobs and error occurrences). */
  status4xx: number;
  /** Requests with statusCode >= 500 (always 0 for jobs and error occurrences). */
  status5xx: number;
}

/** Error as reported by the agent. */
export class WireErrorDto implements WireError {
  /** Error class name. */
  cls?: string;
  message: string;
  stack?: string;
  @ApiPropertyOptional(TAGS_SCHEMA)
  tags?: Record<string, Primitive>;
}

export const SPAN_ORIGINS = ['manual', 'auto'] as const;

@ApiExtraModels(WireErrorDto)
export class TraceSpanDto implements TraceSpan {
  @ApiProperty({ type: String, nullable: true })
  spanId: string | null;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ enum: SPAN_ORIGINS, enumName: 'SpanOrigin' })
  origin: 'manual' | 'auto';

  className: string;
  methodName: string;

  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;

  /** Start offset from the operation start, in ms. */
  @ApiProperty({ type: Number, nullable: true })
  startOffsetMs: number | null;

  @ApiProperty(TAGS_SCHEMA)
  tags: Record<string, Primitive>;

  /** Error details, or `true` when the span failed without details. */
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(WireErrorDto) }, { type: 'boolean' }],
    nullable: true,
  })
  error: WireError | boolean | null;

  @ApiProperty({ type: () => [TraceSpanDto] })
  children: TraceSpanDto[];
}
