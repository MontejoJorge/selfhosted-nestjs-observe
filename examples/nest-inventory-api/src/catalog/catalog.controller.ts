import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CatalogInsightsQueryDto } from './dto/catalog-insights-query.dto.js';
import { CatalogInsightsDto } from './dto/catalog-insights.dto.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /** Product stats across categories; `?fail=true` makes the pricing step throw. */
  @Get('insights')
  getInsights(
    @Query() query: CatalogInsightsQueryDto,
  ): Promise<CatalogInsightsDto> {
    return this.catalogService.getInsights(query.categories, query.fail);
  }
}
