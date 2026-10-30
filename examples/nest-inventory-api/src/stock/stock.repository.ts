import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type {
  NewStock,
  ReservationRow,
  StockRow,
} from '../database/database.types.js';
import { InventoryDatabase } from '../database/inventory-database.js';

/** Outcome of a reservation attempt, decided inside one transaction. */
export type ReserveResult =
  | { status: 'reserved'; reservation: ReservationRow; stock: StockRow }
  | { status: 'not-found' }
  | { status: 'insufficient'; stock: StockRow };

/** Stock levels and reservations in the local SQLite database. */
@Injectable()
export class StockRepository {
  constructor(private readonly database: InventoryDatabase) {}

  private get db() {
    return this.database.db;
  }

  findByProductId(productId: number): Promise<StockRow | undefined> {
    return this.db
      .selectFrom('stock')
      .selectAll()
      .where('product_id', '=', productId)
      .executeTakeFirst();
  }

  /** Products with the fewest units left to reserve. */
  findLowestAvailable(limit: number): Promise<StockRow[]> {
    return this.db
      .selectFrom('stock')
      .selectAll()
      .orderBy(sql`on_hand - reserved`)
      .orderBy('product_id')
      .limit(limit)
      .execute();
  }

  /** Holds `quantity` units of a product, if that many are still available. */
  reserve(
    productId: number,
    quantity: number,
    userId: string | null,
  ): Promise<ReserveResult> {
    return this.db.transaction().execute(async (trx) => {
      const stock = await trx
        .selectFrom('stock')
        .selectAll()
        .where('product_id', '=', productId)
        .executeTakeFirst();
      if (!stock) return { status: 'not-found' };
      if (stock.on_hand - stock.reserved < quantity) {
        return { status: 'insufficient', stock };
      }

      const now = new Date().toISOString();
      const reservation = await trx
        .insertInto('reservations')
        .values({
          product_id: productId,
          quantity,
          user_id: userId,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const updated = await trx
        .updateTable('stock')
        .set({ reserved: sql`reserved + ${quantity}`, updated_at: now })
        .where('product_id', '=', productId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { status: 'reserved', reservation, stock: updated };
    });
  }

  /** Inserts or refreshes the stock of the given products, keeping their reservations. */
  async upsertMany(rows: NewStock[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insertInto('stock')
      .values(rows)
      .onConflict((oc) =>
        oc.column('product_id').doUpdateSet((eb) => ({
          title: eb.ref('excluded.title'),
          on_hand: eb.ref('excluded.on_hand'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute();
  }

  /** Drops reservations created before `before` and recounts what each product holds. */
  releaseReservationsBefore(before: Date): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const { numDeletedRows } = await trx
        .deleteFrom('reservations')
        .where('created_at', '<', before.toISOString())
        .executeTakeFirst();
      if (numDeletedRows === 0n) return 0;

      await trx
        .updateTable('stock')
        .set((eb) => ({
          reserved: eb.fn.coalesce(
            eb
              .selectFrom('reservations')
              .select((r) => r.fn.sum<number>('quantity').as('total'))
              .whereRef('reservations.product_id', '=', 'stock.product_id'),
            eb.lit(0),
          ),
        }))
        .execute();
      return Number(numDeletedRows);
    });
  }
}
