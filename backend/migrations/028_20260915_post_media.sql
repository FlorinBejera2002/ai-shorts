-- revision: 20260915_post_media
-- parent: 20260915_0002
ALTER TABLE scheduled_posts ADD COLUMN media JSONB DEFAULT '[]'::jsonb NOT NULL;

