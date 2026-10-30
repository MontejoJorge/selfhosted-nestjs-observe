import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  CreateReservationDto,
  ReservationDto,
  StockLevelDto,
} from './dto/stock.dto.js';
import { StockService } from './stock.service.js';

/** Local stock levels and reservations, stored in SQLite. */
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /** The products with the fewest units left to reserve. */
  @Get('low')
  getLowest(): Promise<StockLevelDto[]> {
    return this.stockService.getLowest();
  }

  @Get(':productId')
  getLevel(
    @Param('productId', ParseIntPipe) productId: number,
  ): Promise<StockLevelDto> {
    return this.stockService.getLevel(productId);
  }

  /** Holds units of a product; 409 when not enough are available. */
  @Post(':productId/reservations')
  reserve(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: CreateReservationDto,
    @Headers('x-user-id') userId?: string,
  ): Promise<ReservationDto> {
    return this.stockService.reserve(productId, body.quantity, userId ?? null);
  }
}
