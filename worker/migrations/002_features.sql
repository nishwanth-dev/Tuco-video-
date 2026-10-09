-- Run once on an existing database: npx wrangler d1 execute tuco-video --remote --file=migrations/002_features.sql
ALTER TABLE videos ADD COLUMN cta_text TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN cta_url TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN starts_at INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN ends_at INTEGER DEFAULT 0;
ALTER TABLE widgets ADD COLUMN collection_handles TEXT DEFAULT '[]';
ALTER TABLE widgets ADD COLUMN page_handles TEXT DEFAULT '[]';
ALTER TABLE events ADD COLUMN device TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN src TEXT DEFAULT '';
CREATE TABLE IF NOT EXISTS order_attrib (
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (order_id, line_id)
);
CREATE INDEX IF NOT EXISTS idx_attrib_video ON order_attrib(video_id);
