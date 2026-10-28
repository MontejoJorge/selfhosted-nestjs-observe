import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

// Transforms read the raw value from `obj`, because implicit conversion has already
// turned strings like "false" into `true` by the time `value` is passed in.
interface RawTransform {
  obj: Record<string, unknown>;
  key: string;
}

const emptyToUndefined = ({ obj, key }: RawTransform) =>
  obj[key] === '' ? undefined : obj[key];

const toBoolean = ({ obj, key }: RawTransform) => {
  const value = obj[key];
  if (value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value;
  return (
    typeof value === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  );
};

/** Environment variables read by the API. See the root `.env.example`. */
export class Env {
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;

  /** Defaults to the docker-compose database, so the app can boot (e.g. preview mode) without env. */
  @IsString()
  @MinLength(1)
  DATABASE_URL: string = 'postgres://observe:observe@localhost:5432/observe';

  /** Max connections in the pg pool. */
  @IsInt()
  @Min(1)
  @Max(200)
  DATABASE_POOL_MAX: number = 10;

  /** Apply pending migrations when the API starts. */
  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_MIGRATE_ON_START: boolean = true;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  INGEST_API_KEY?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  INGEST_API_SECRET?: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  RETENTION_DAYS: number = 14;

  /** Comma-separated list of origins allowed to call the query API. */
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:5173';
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return env;
}
