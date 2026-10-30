import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { StockRow } from '../database/database.types.js';
import { ReservationDto, StockLevelDto } from './dto/stock.dto.js';
import { StockRepository } from './stock.repository.js';

const LOW_STOCK_LIMIT = 10;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly stock: StockRepository) {}

  async getLevel(productId: number): Promise<StockLevelDto> {
    const row = await this.stock.findByProductId(productId);
    if (!row) throw new NotFoundException(`No stock for product ${productId}`);
    return toStockLevel(row);
  }

  async getLowest(): Promise<StockLevelDto[]> {
    const rows = await this.stock.findLowestAvailable(LOW_STOCK_LIMIT);
    return rows.map(toStockLevel);
  }

  async reserve(
    productId: number,
    quantity: number,
    userId: string | null,
  ): Promise<ReservationDto> {
    const result = await this.stock.reserve(productId, quantity, userId);
    switch (result.status) {
      case 'not-found':
        throw new NotFoundException(`No stock for product ${productId}`);
      case 'insufficient': {
        const available = result.stock.on_hand - result.stock.reserved;
        this.logger.warn(
          `Product ${productId}: asked for ${quantity}, ${available} available`,
        );
        throw new ConflictException(
          `Only ${available} units of product ${productId} are available`,
        );
      }
      case 'reserved': {
        const { reservation, stock } = result;
        return {
          id: reservation.id,
          productId: reservation.product_id,
          quantity: reservation.quantity,
          userId: reservation.user_id,
          createdAt: reservation.created_at,
          stock: toStockLevel(stock),
        };
      }
    }
  }
}

function toStockLevel(row: StockRow): StockLevelDto {
  return {
    productId: row.product_id,
    title: row.title,
    onHand: row.on_hand,
    reserved: row.reserved,
    // A sync can lower on_hand below what is already reserved.
    available: Math.max(0, row.on_hand - row.reserved),
    updatedAt: row.updated_at,
  };
}
