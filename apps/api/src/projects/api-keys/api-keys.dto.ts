import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CursorQueryDto } from '../../telemetry/common/query.dto.js';
import { API_KEY_STATUSES, type ApiKeyStatus } from '../domain/api-key.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ApiKeysQueryDto extends CursorQueryDto {
  /** Only the keys of this application. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  applicationId?: string;
}

export class ApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  name: string;
  /** Public key id: the agent's `appKey`, sent as `x-api-key`. */
  keyId: string;
  @ApiProperty({ format: 'uuid' })
  applicationId: string;
  applicationName: string;
  @ApiProperty({ enum: API_KEY_STATUSES, enumName: 'ApiKeyStatus' })
  status: ApiKeyStatus;
  @ApiProperty({ type: String, nullable: true })
  revokedAt: string | null;
  createdAt: string;
}

export class CreatedApiKeyDto extends ApiKeyDto {
  /** The agent's `appSecret`, sent as `x-api-secret`. Returned only once, at creation. */
  secret: string;
}

export class ApiKeyPageDto {
  @ApiProperty({ type: [ApiKeyDto] })
  items: ApiKeyDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class CreateApiKeyDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Application (of this project) the key sends telemetry for. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  applicationId: string;
}
