import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  /** Version of the running collector. */
  currentVersion: string;
  /** Whether the latest release is looked up every 12 hours: the switch and UPDATE_CHECK both on. */
  enabled: boolean;
  /** UPDATE_CHECK=false: never checks, and the switch can't turn it on. */
  disabledByEnv: boolean;
  /** Tag of the latest release found, e.g. `v1.1.0`; null before the first successful check. */
  @ApiProperty({ type: String, nullable: true })
  latestVersion: string | null;
  /** Release page of `latestVersion`. */
  @ApiProperty({ type: String, nullable: true })
  latestUrl: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  latestPublishedAt: string | null;
  /** True when the check is on and `latestVersion` is newer than `currentVersion`. */
  updateAvailable: boolean;
  /** Every release of the collector. */
  releasesUrl: string;
  /** Last attempt, successful or not. */
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkedAt: string | null;
  /** Why the last attempt failed; null when it succeeded. */
  @ApiProperty({ type: String, nullable: true })
  error: string | null;
}

export class UpdateSettingsDto {
  /** Look up the latest release every 12 hours. */
  @IsBoolean()
  enabled: boolean;
}
