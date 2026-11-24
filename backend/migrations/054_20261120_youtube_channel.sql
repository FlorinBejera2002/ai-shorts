-- revision: 20261120_youtube_channel
-- parent: 20261119_clip_favorites
-- One read-only YouTube channel connection per user. Tokens are encrypted with
-- the social token key and bound to the owner; the row disappears with the user.
CREATE TABLE youtube_channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL CHECK (channel_id <> ''),
    title TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    uploads_playlist_id TEXT NOT NULL CHECK (uploads_playlist_id <> ''),
    credentials TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
