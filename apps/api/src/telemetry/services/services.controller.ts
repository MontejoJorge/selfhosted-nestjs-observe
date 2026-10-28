import { Controller, Get } from '@nestjs/common';
import type { ServiceSummary } from '@selfhosted-observe/contracts';
import { ServicesRepository } from './services.repository.js';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesRepository) {}

  /** GET /api/services */
  @Get()
  list(): Promise<ServiceSummary[]> {
    return this.services.list();
  }
}
