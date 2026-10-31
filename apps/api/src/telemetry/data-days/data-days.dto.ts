import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DataDaysQueryDto {
  /** Narrow to one application of the project. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  application?: string;
}

export class DataDaysDto {
  /** UTC days (`YYYY-MM-DD`) with telemetry, ascending. */
  @ApiProperty({ type: String, isArray: true, format: 'date' })
  days: string[];
  /** First entry of `days`, null when there is none. */
  @ApiProperty({ type: String, format: 'date', nullable: true })
  oldest: string | null;
  /** Last entry of `days`, null when there is none. */
  @ApiProperty({ type: String, format: 'date', nullable: true })
  newest: string | null;
}
