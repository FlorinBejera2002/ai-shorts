-- revision: 20260922_story_builder
-- parent: 20260922_smart_transitions
CREATE TABLE story_projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    options JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    message TEXT NOT NULL DEFAULT '',
    current_version INTEGER NOT NULL DEFAULT 0,
    locks JSONB NOT NULL DEFAULT '[]',
    request JSONB,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    executions INTEGER NOT NULL DEFAULT 0,
    ai_calls INTEGER NOT NULL DEFAULT 0,
    stage_metrics JSONB NOT NULL DEFAULT '{}',
    stage_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX ix_story_owner ON story_projects(user_id,updated_at DESC);
CREATE INDEX ix_story_queue ON story_projects(status,updated_at) WHERE status='pending';
CREATE TABLE story_assets (
    project_id UUID NOT NULL REFERENCES story_projects(id) ON DELETE CASCADE,
    id UUID NOT NULL,
    hash TEXT NOT NULL,
    asset JSONB NOT NULL,
    PRIMARY KEY(project_id,id),
    UNIQUE(project_id,hash)
);
CREATE TABLE story_versions (
    project_id UUID NOT NULL REFERENCES story_projects(id) ON DELETE CASCADE,
    number INTEGER NOT NULL CHECK(number>0),
    version JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,number)
);
CREATE TABLE story_requests (
    project_id UUID NOT NULL REFERENCES story_projects(id) ON DELETE CASCADE,
    id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,id)
);
CREATE TABLE story_attempts (
    project_id UUID NOT NULL REFERENCES story_projects(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    attempt JSONB NOT NULL,
    version INTEGER GENERATED ALWAYS AS ((attempt->>'version')::integer) STORED,
    operation TEXT GENERATED ALWAYS AS (attempt->>'operation') STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id,request_id,version,operation)
);
CREATE INDEX ix_story_attempts ON story_attempts(project_id,created_at);
ALTER TABLE clips ADD COLUMN story_project_id UUID REFERENCES story_projects(id) ON DELETE CASCADE;
ALTER TABLE clips ADD COLUMN story_version INTEGER;
CREATE UNIQUE INDEX ix_story_current_clip ON clips(story_project_id) WHERE story_project_id IS NOT NULL;
