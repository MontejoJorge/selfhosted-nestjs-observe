import type { Generated, Insertable, Selectable } from 'kysely';

/** Stock kept for each DummyJSON product. `reserved` sums its open reservations. */
export interface StockTable {
  product_id: number;
  /** Filled in by the `inventory-reconcile` job; `null` until it syncs the product. */
  title: string | null;
  on_hand: number;
  reserved: number;
  /** ISO 8601 timestamp. */
  updated_at: string;
}

/** Units held for a user until the reconcile job releases them. */
export interface ReservationsTable {
  id: Generated<number>;
  product_id: number;
  quantity: number;
  user_id: string | null;
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface InventoryTables {
  stock: StockTable;
  reservations: ReservationsTable;
}

export type StockRow = Selectable<StockTable>;
export type NewStock = Insertable<StockTable>;
export type ReservationRow = Selectable<ReservationsTable>;
