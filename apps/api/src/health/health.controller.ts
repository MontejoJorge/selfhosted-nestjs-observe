import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { sql } from 'kysely';
import { KYSELY, type Db } from '../database/database.types.js';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  /** GET /api/health: 200 when the database answers. */
  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Liveness and database check',
  })
  @ApiOkResponse({ type: HealthDto })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await sql`select 1`.execute(this.db);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
