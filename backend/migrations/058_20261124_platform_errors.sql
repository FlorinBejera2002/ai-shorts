-- revision: 20261124_platform_errors
-- parent: 20261124_youtube_selection
-- Platform error log for the admin console. Occurrences are grouped by a
-- fingerprint (source, kind, route and the message without IDs/numbers).
-- platform_error_events keeps sampled occurrences for 30 days; a group that
-- recurs after being resolved is reopened by the recorder.
CREATE TABLE platform_error_groups (
    id BIGSERIAL PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('api','worker','web','admin')),
    kind TEXT NOT NULL CHECK (kind IN ('http','log','client')),
    message TEXT NOT NULL,
    route TEXT NOT NULL DEFAULT '',
    occurrences BIGINT NOT NULL DEFAULT 0 CHECK (occurrences >= 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX platform_error_groups_last_seen ON platform_error_groups(last_seen_at DESC);
CREATE TABLE platform_error_events (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES platform_error_groups(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
    detail TEXT NOT NULL DEFAULT '',
    context JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX platform_error_events_group ON platform_error_events(group_id, occurred_at DESC);
CREATE INDEX platform_error_events_time ON platform_error_events(occurred_at);
