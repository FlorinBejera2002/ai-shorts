-- revision: 20260930_admin_console
-- parent: 20260930_story_clips_library
ALTER TABLE users DROP CONSTRAINT ck_users_access_role;

ALTER TABLE users
    ADD CONSTRAINT ck_users_access_role
    CHECK (access_role IN ('member', 'viewer', 'admin'));

ALTER TABLE users
    ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE users
    ADD CONSTRAINT ck_users_account_status
    CHECK (account_status IN ('active', 'suspended'));

CREATE TABLE admin_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ix_admin_audit_events_created_at
    ON admin_audit_events (created_at DESC, id DESC);

CREATE INDEX ix_admin_audit_events_target_user_id
    ON admin_audit_events (target_user_id, created_at DESC);
