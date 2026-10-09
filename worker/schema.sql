CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  poster TEXT DEFAULT '',
  audience TEXT DEFAULT 'kids',
  status TEXT DEFAULT 'draft',
  placements TEXT DEFAULT '[]',
  product_title TEXT DEFAULT '',
  product_handle TEXT DEFAULT '',
  product_price TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  source TEXT DEFAULT 'upload',
  source_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_source ON videos(source_id) WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  type TEXT NOT NULL,
  secs REAL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_video ON events(video_id, type);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
