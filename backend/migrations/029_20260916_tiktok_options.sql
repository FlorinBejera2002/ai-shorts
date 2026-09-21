-- revision: 20260916_tiktok_options
-- parent: 20260915_post_media
ALTER TABLE scheduled_posts ADD COLUMN tiktok_options JSONB DEFAULT '{}'::jsonb NOT NULL;

