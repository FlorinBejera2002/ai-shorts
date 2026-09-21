-- revision: 20260918_ig_options
-- parent: 20260917_clip_tiktok_asset
ALTER TABLE scheduled_posts ADD COLUMN instagram_options JSONB DEFAULT '{}'::jsonb NOT NULL;

