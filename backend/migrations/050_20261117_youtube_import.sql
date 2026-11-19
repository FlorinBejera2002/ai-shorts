-- revision: 20261117_youtube_import
-- parent: 20261019_facebook_options
CREATE TABLE youtube_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('authorizing','queued','exporting','importing','ready','failed','cancelled')),
    resources TEXT[] NOT NULL CHECK (cardinality(resources) BETWEEN 1 AND 3 AND resources <@ ARRAY['youtube.public_videos','youtube.unlisted_videos','youtube.private_videos']::text[]),
    credentials TEXT NOT NULL DEFAULT '',
    archive_id TEXT NOT NULL DEFAULT '',
    access_type TEXT NOT NULL DEFAULT '',
    initiate_started_at TIMESTAMPTZ,
    authorization_in_progress BOOLEAN NOT NULL DEFAULT false,
    cleanup_pending BOOLEAN NOT NULL DEFAULT false,
    completion_status TEXT NOT NULL DEFAULT '' CHECK (completion_status IN ('','ready','failed','cancelled')),
    completion_error TEXT NOT NULL DEFAULT '',
    consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    session_version INTEGER NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_token TEXT,
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX youtube_imports_one_active_user ON youtube_imports(user_id)
    WHERE status IN ('authorizing','queued','exporting','importing') OR cleanup_pending;
CREATE INDEX youtube_imports_due ON youtube_imports(next_poll_at)
    WHERE status IN ('queued','exporting','importing') OR cleanup_pending;

CREATE TABLE youtube_import_oauth_states (
    state_hash TEXT PRIMARY KEY,
    import_id UUID NOT NULL REFERENCES youtube_imports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    browser_hash TEXT NOT NULL,
    verifier TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en','ro')),
    session_version INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX youtube_import_oauth_states_expiry ON youtube_import_oauth_states(expires_at);

CREATE TABLE youtube_import_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL REFERENCES youtube_imports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    source_storage_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(import_id, relative_path),
    UNIQUE(source_storage_key)
);
CREATE INDEX youtube_import_videos_library ON youtube_import_videos(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Cleanup is retried independently of a cancelled import and survives an API
-- restart. Entries disappear with full account deletion, whose media cleanup
-- removes the owner's entire uploads prefix.
CREATE TABLE youtube_import_cleanup (
    source_storage_key TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
