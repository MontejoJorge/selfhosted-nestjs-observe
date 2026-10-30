import { type Kysely, sql } from 'kysely';
import type { InventoryTables, NewStock } from './database.types.js';

/** Products seeded on first start, so the stock endpoints answer before the reconcile job runs. */
const SEEDED_PRODUCTS = 30;

/** Creates the tables if they are missing. Idempotent, runs on every start. */
export async function createSchema(db: Kysely<InventoryTables>): Promise<void> {
  await db.schema
    .createTable('stock')
    .ifNotExists()
    .addColumn('product_id', 'integer', (col) => col.primaryKey())
    .addColumn('title', 'text')
    .addColumn('on_hand', 'integer', (col) => col.notNull())
    .addColumn('reserved', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('reservations')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('product_id', 'integer', (col) =>
      col.notNull().references('stock.product_id').onDelete('cascade'),
    )
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('user_id', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('reservations_created_at_idx')
    .ifNotExists()
    .on('reservations')
    .column('created_at')
    .execute();
}

/** Seeds stock for the first products when the table is empty. */
export async function seed(db: Kysely<InventoryTables>): Promise<void> {
  const { count } = await db
    .selectFrom('stock')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirstOrThrow();
  if (count > 0) return;

  const now = new Date().toISOString();
  const rows: NewStock[] = Array.from({ length: SEEDED_PRODUCTS }, (_, i) => ({
    product_id: i + 1,
    title: null,
    // Deterministic spread between 5 and 120 units, a few of them low.
    on_hand: 5 + ((i * 37) % 116),
    reserved: 0,
    updated_at: now,
  }));
  await db.insertInto('stock').values(rows).execute();
}
