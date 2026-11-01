import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import {
  SELF_OBSERVE_SOURCES,
  type SelfObserveSource,
} from './domain/self-observe.js';

export class SelfObserveStatusDto {
  /** The switch: report the collector's own telemetry to its "Self" project. */
  enabled: boolean;
  /**
   * How the collector's agent runs since the last start: `off`, `self` (the switch) or
   * `env` (OBSERVE_APP_KEY / OBSERVE_APP_SECRET, which the switch can't change).
   */
  @ApiProperty({ enum: SELF_OBSERVE_SOURCES, enumName: 'SelfObserveSource' })
  source: SelfObserveSource;
  /** The switch changed since the last start: restart the collector to apply it. */
  restartRequired: boolean;
  /** Project the collector reports to in self mode; null before the switch is first on. */
  @ApiProperty({ type: String, nullable: true })
  projectSlug: string | null;
  @ApiProperty({ type: String, nullable: true })
  projectName: string | null;
  @ApiProperty({ type: String, nullable: true })
  applicationName: string | null;
}

export class UpdateSelfObserveDto {
  /** On: creates the "Self" project and its application when missing. */
  @IsBoolean()
  enabled: boolean;
}
