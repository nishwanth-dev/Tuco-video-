-- Run once on an existing database: npx wrangler d1 execute tuco-video --remote --file=migrations/005_store_orders.sql
CREATE TABLE IF NOT EXISTS store_orders (
  order_id TEXT PRIMARY KEY,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_orders_at ON store_orders(at);
