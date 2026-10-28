import { ApiProperty } from '@nestjs/swagger';
import type { ServiceSummary } from '@selfhosted-observe/contracts';

export class ServiceSummaryDto implements ServiceSummary {
  serviceId: string;
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
