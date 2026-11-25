-- revision: 20261123_youtube_previews
-- parent: 20261120_story_clip_outputs
-- Imported YouTube videos get one small preview frame stored beside their source. A NULL key means no preview yet; thumbnail_attempts bounds background retries of broken videos.
ALTER TABLE youtube_import_videos
    ADD COLUMN thumbnail_storage_key TEXT,
    ADD COLUMN thumbnail_attempts INTEGER NOT NULL DEFAULT 0 CHECK (thumbnail_attempts >= 0),
    ADD COLUMN thumbnail_lease_until TIMESTAMPTZ;
CREATE INDEX youtube_import_videos_thumbnail_backlog ON youtube_import_videos(created_at) WHERE deleted_at IS NULL AND thumbnail_storage_key IS NULL;
