import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ServiceSummary } from '@selfhosted-observe/contracts';
import { ServiceSummaryDto } from './services.dto.js';
import { ServicesRepository } from './services.repository.js';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesRepository) {}

  @Get()
  @ApiOperation({
    operationId: 'listServices',
    summary: 'Services that have sent telemetry',
  })
  @ApiOkResponse({ type: [ServiceSummaryDto] })
  list(): Promise<ServiceSummary[]> {
    return this.services.list();
  }
}
