import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDatabasePath = fileURLToPath(
  new URL("../../data/store.db", import.meta.url),
);

export const databasePath = resolve(
  process.env.ECOM_OPS_DB_PATH ?? defaultDatabasePath,
);

mkdirSync(dirname(databasePath), { recursive: true });

export const db: Database.Database = new Database(databasePath);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

export const STORE_SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    stock_qty INTEGER NOT NULL CHECK (stock_qty >= 0),
    reorder_level INTEGER NOT NULL CHECK (reorder_level >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'paid', 'shipped', 'failed_webhook', 'refunded')
    ),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_status TEXT NOT NULL CHECK (
      payment_status IN ('pending', 'paid', 'failed', 'refunded')
    ),
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

db.exec(STORE_SCHEMA_DDL);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`);

export default db;
