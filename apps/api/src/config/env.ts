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

const toBoolean = ({ obj, key }: RawTransform) => {
  const value = obj[key];
  if (value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value;
  return (
    typeof value === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  );
};

/** Environment variables read by the API (and the migrate CLI). See the root `.env.example`. */
export class Env {
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;

  // The DATABASE_* defaults match docker-compose, so the app can boot (e.g. preview mode) without env.
  @IsString()
  @MinLength(1)
  DATABASE_HOST: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT: number = 5432;

  @IsString()
  @MinLength(1)
  DATABASE_USER: string = 'observe';

  @IsString()
  DATABASE_PASSWORD: string = 'observe';

  @IsString()
  @MinLength(1)
  DATABASE_NAME: string = 'observe';

  /** Max connections in the pg pool. */
  @IsInt()
  @Min(1)
  @Max(200)
  DATABASE_POOL_MAX: number = 10;

  /** Apply pending migrations when the API starts. */
  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_MIGRATE_ON_START: boolean = true;

  @IsInt()
  @Min(1)
  @Max(3650)
  RETENTION_DAYS: number = 14;

  /** Built dashboard to serve from `/` (set in the Docker image). Unset: API only. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  DASHBOARD_DIR?: string;

  /** Self-observation: the collector's own agent credentials. Unset: disabled. */
  @IsOptional()
  @IsString()
  OBSERVE_APP_KEY?: string;

  @IsOptional()
  @IsString()
  OBSERVE_APP_SECRET?: string;

  /** Where the collector sends its own telemetry, usually itself. */
  @IsOptional()
  @IsString()
  OBSERVE_ENDPOINT?: string;
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

/** Connection settings for `createDatabase`, from a reader of the validated env. */
export function databaseOptions(get: <K extends keyof Env>(key: K) => Env[K]) {
  return {
    host: get('DATABASE_HOST'),
    port: get('DATABASE_PORT'),
    user: get('DATABASE_USER'),
    password: get('DATABASE_PASSWORD'),
    database: get('DATABASE_NAME'),
    poolMax: get('DATABASE_POOL_MAX'),
  };
}
