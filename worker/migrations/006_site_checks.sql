-- Results of the automatic website checks (banners load, play and have the right size). One row per run.
CREATE TABLE IF NOT EXISTS site_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  status TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  duration_s INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '{}',
  details TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_site_checks_at ON site_checks(at);
