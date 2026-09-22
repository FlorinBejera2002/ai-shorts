-- revision: 20260922_youtube_options
-- parent: 20260918_ig_options
ALTER TABLE scheduled_posts ADD COLUMN youtube_options JSONB DEFAULT '{}'::jsonb NOT NULL;
