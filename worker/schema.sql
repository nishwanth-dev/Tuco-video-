CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  poster TEXT DEFAULT '',
  audience TEXT DEFAULT 'kids',
  status TEXT DEFAULT 'draft',
  placements TEXT DEFAULT '[]',
  products TEXT DEFAULT '[]',
  archived INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  source TEXT DEFAULT 'upload',
  source_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_source ON videos(source_id) WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  page TEXT NOT NULL,
  scope TEXT DEFAULT 'tagged',
  video_ids TEXT DEFAULT '[]',
  product_handles TEXT DEFAULT '[]',
  heading TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  type TEXT NOT NULL,
  secs REAL DEFAULT 0,
  widget TEXT DEFAULT '',
  product TEXT DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_video ON events(video_id, type);
CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
