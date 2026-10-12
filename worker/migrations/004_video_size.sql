-- Run once on an existing database: npx wrangler d1 execute tuco-video --remote --file=migrations/004_video_size.sql
ALTER TABLE videos ADD COLUMN size INTEGER DEFAULT 0;
