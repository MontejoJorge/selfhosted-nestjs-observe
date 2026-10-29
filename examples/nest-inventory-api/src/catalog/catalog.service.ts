import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { getJson } from '../common/http/get-json.js';
import { average, round2 } from '../common/round.js';
import { DummyProduct } from './catalog.types.js';
import {
  CatalogInsightsDto,
  PricedProductDto,
} from './dto/catalog-insights.dto.js';

const DUMMYJSON_URL = 'https://dummyjson.com';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  async getInsights(
    categories: string[],
    fail: boolean,
  ): Promise<CatalogInsightsDto> {
    this.logger.log(`Catalog insights for: ${categories.join(', ')}`);
    await this.validateCategories(categories);

    const productsByCategory = await Promise.all(
      categories.map((category) => this.fetchCategoryProducts(category)),
    );

    const ranked = this.rankProducts(productsByCategory.flat());
    const priced = await this.applyPricingRules(ranked, fail);

    return {
      categories: categories.map((category, index) => ({
        category,
        products: productsByCategory[index].length,
        averagePrice: average(productsByCategory[index].map((p) => p.price)),
        averageRating: average(productsByCategory[index].map((p) => p.rating)),
      })),
      topRated: priced.slice(0, 5),
      lowStock: priced
        .filter((product) => product.stock < 10)
        .map(({ id, title, stock }) => ({ id, title, stock })),
    };
  }

  private async validateCategories(categories: string[]): Promise<void> {
    const known = await getJson<string[]>(
      `${DUMMYJSON_URL}/products/category-list`,
    );
    const unknown = categories.filter((category) => !known.includes(category));
    if (unknown.length > 0) {
      this.logger.warn(`Rejected unknown categories: ${unknown.join(', ')}`);
      throw new BadRequestException(
        `Unknown categories: ${unknown.join(', ')}`,
      );
    }
  }

  private async fetchCategoryProducts(
    category: string,
  ): Promise<DummyProduct[]> {
    const { products } = await getJson<{ products: DummyProduct[] }>(
      `${DUMMYJSON_URL}/products/category/${encodeURIComponent(category)}` +
        '?limit=0&select=title,category,price,rating,stock,discountPercentage',
    );
    return products;
  }

  private rankProducts(products: DummyProduct[]): DummyProduct[] {
    return [...products].sort(
      (a, b) => b.rating - a.rating || a.price - b.price,
    );
  }

  /** A slow, flaky "pricing engine": an artificial delay that can fail. */
  private async applyPricingRules(
    products: DummyProduct[],
    fail: boolean,
  ): Promise<PricedProductDto[]> {
    await sleep(150 + Math.round(Math.random() * 200));

    if (fail) {
      this.logger.error(
        `Pricing engine timed out while pricing ${products.length} products`,
      );
      throw new Error('Pricing engine timed out');
    }

    return products.map((product) => ({
      ...product,
      finalPrice: round2(
        product.price * (1 - product.discountPercentage / 100),
      ),
    }));
  }
}
