import { ApiProperty } from '@nestjs/swagger';
import type { InstanceSummary } from '@selfhosted-observe/contracts';

export class InstanceSummaryDto implements InstanceSummary {
  applicationId: string;
  /** The agent's serviceId. */
  serviceId: string;
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
