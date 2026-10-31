import { IsInt, Max, Min } from 'class-validator';

export class StockLevelDto {
  productId: number;
  /** `null` until the `inventory-reconcile` job has synced the product. */
  title: string | null;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: string;
}

export class CreateReservationDto {
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;
}

export class ReservationDto {
  id: number;
  productId: number;
  quantity: number;
  userId: string | null;
  createdAt: string;
  stock: StockLevelDto;
}
