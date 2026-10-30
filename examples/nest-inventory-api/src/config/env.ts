import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/** Environment variables read by the app. See `.env.example`. */
export class Env {
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 34240;

  @IsString()
  @IsNotEmpty()
  OBSERVE_APP_KEY: string;

  @IsString()
  @IsNotEmpty()
  OBSERVE_APP_SECRET: string;

  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  OBSERVE_ENDPOINT: string;

  /** SQLite database file, relative to the working directory. Created on startup. */
  @IsString()
  @IsNotEmpty()
  SQLITE_FILE: string = 'data/inventory.sqlite';
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(
      `Invalid environment. Set these variables in .env (see .env.example):\n${details}`,
    );
  }
  return env;
}
