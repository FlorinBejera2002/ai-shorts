-- revision: 20261124_youtube_selection
-- parent: 20261123_youtube_previews
-- Selected-video imports. job_options holds the clip options chosen with the
-- selection (NULL for whole-category imports). Each selected channel video gets
-- one row: waiting -> importing (video stored) -> processing (clip job queued),
-- or missing / failed. job_id is set in the same transaction that queues the job.
ALTER TABLE youtube_imports ADD COLUMN job_options JSONB;
CREATE TABLE youtube_import_selections (
    import_id UUID NOT NULL REFERENCES youtube_imports(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
    video_id TEXT NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
    title TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','importing','processing','missing','failed')),
    source_storage_key TEXT NOT NULL DEFAULT '',
    job_id UUID,
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (import_id, video_id),
    UNIQUE (import_id, position)
);
CREATE INDEX youtube_import_selections_open ON youtube_import_selections(import_id) WHERE status IN ('waiting','importing');
