-- revision: 20261019_facebook_options
-- parent: 20261016_logo_position
ALTER TABLE scheduled_posts ADD COLUMN facebook_options JSONB DEFAULT '{}'::jsonb NOT NULL;
