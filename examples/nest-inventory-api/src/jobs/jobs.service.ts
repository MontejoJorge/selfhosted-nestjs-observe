import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DummyProduct } from '../catalog/catalog.types.js';
import { getJson } from '../common/http/get-json.js';
import type { PokemonResponse } from '../pokemon/pokemon.types.js';

const POKEAPI_URL = 'https://pokeapi.co/api/v2';
const DUMMYJSON_URL = 'https://dummyjson.com';

/** Share of inventory reconciliations that fail, so the Jobs page shows failures. */
const RECONCILE_FAILURE_RATE = 0.2;

interface FeaturedPokemon {
  name: string;
  totalStats: number;
}

/**
 * Scheduled jobs. `@nestjs/observe` traces each run as a job, with a span per
 * method call and per outbound request.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  /** Every minute: picks a few random pokemon and ranks them by total base stats. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'featured-pokemon' })
  async refreshFeaturedPokemon(): Promise<void> {
    const ids = Array.from(
      { length: 3 + randomInt(3) },
      () => 1 + randomInt(151),
    );
    const pokemon = await Promise.all(ids.map((id) => this.fetchPokemon(id)));
    const ranking = this.rankByStats(pokemon);
    this.logger.log(
      `Featured pokemon: ${ranking.map((p) => `${p.name} (${p.totalStats})`).join(', ')}`,
    );
  }

  /** Every minute, at second 30: checks a page of products for low stock. */
  @Cron('30 * * * * *', { name: 'inventory-reconcile' })
  async reconcileInventory(): Promise<void> {
    const skip = randomInt(150);
    const { products } = await this.fetchProductsPage(skip);
    const lowStock = this.findLowStock(products);
    await this.persistReport(lowStock);
    this.logger.log(
      `Reconciled ${products.length} products from offset ${skip}: ${lowStock.length} low on stock`,
    );
  }

  private fetchPokemon(id: number): Promise<PokemonResponse> {
    return getJson<PokemonResponse>(`${POKEAPI_URL}/pokemon/${id}`);
  }

  private rankByStats(pokemon: PokemonResponse[]): FeaturedPokemon[] {
    return pokemon
      .map((p) => ({
        name: p.name,
        totalStats: p.stats.reduce((sum, s) => sum + s.base_stat, 0),
      }))
      .sort((a, b) => b.totalStats - a.totalStats);
  }

  private fetchProductsPage(
    skip: number,
  ): Promise<{ products: DummyProduct[] }> {
    return getJson(`${DUMMYJSON_URL}/products?limit=30&skip=${skip}`);
  }

  private findLowStock(products: DummyProduct[]): DummyProduct[] {
    return products.filter((p) => p.stock < 20);
  }

  /** Simulates writing the report to a slow warehouse API that sometimes times out. */
  private async persistReport(lowStock: DummyProduct[]): Promise<void> {
    await sleep(200 + randomInt(800));
    if (Math.random() < RECONCILE_FAILURE_RATE) {
      this.logger.error(
        `Warehouse API timed out while saving ${lowStock.length} low-stock items`,
      );
      throw new Error('Warehouse API timed out');
    }
  }
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}
