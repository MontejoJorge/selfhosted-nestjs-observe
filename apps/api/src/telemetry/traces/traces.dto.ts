import { ApiProperty } from '@nestjs/swagger';
import type { TraceDetail } from '@selfhosted-observe/contracts';
import { JobDetailDto } from '../jobs/jobs.dto.js';
import { LogItemDto } from '../logs/logs.dto.js';
import { RequestDetailDto } from '../requests/requests.dto.js';

export class TraceDetailDto implements TraceDetail {
  traceId: string;
  @ApiProperty({ type: [RequestDetailDto] })
  requests: RequestDetailDto[];
  @ApiProperty({ type: [JobDetailDto] })
  jobs: JobDetailDto[];
  /** Logs carrying this trace id, oldest first. */
  @ApiProperty({ type: [LogItemDto] })
  logs: LogItemDto[];
}
