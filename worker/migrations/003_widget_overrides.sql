-- Run once on an existing database: npx wrangler d1 execute tuco-video --remote --file=migrations/003_widget_overrides.sql
ALTER TABLE widgets ADD COLUMN overrides TEXT DEFAULT '{}';
