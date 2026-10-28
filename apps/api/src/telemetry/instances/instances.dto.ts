import { ApiProperty } from '@nestjs/swagger';

export class InstanceSummaryDto {
  applicationId: string;
  /** The agent's serviceId. */
  serviceId: string;
  @ApiProperty({ type: String, nullable: true })
  serviceVersion: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
