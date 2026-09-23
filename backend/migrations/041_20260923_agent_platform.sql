-- revision: 20260923_agent_platform
-- parent: 20260923_project_agent_edits
CREATE TABLE agent_action_receipts (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 action text NOT NULL,
 input jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE scheduled_posts ADD COLUMN agent_binding jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE social_posts ADD COLUMN agent_account_binding text NOT NULL DEFAULT '';
CREATE TABLE workspace_agent_resources (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id uuid REFERENCES story_projects(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('logo','document','publishing_media')),
 name text NOT NULL,
 reference text NOT NULL DEFAULT '',
 content text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspace_agent_runs ADD COLUMN resource_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE workspace_agent_runs ADD COLUMN missing_resources jsonb NOT NULL DEFAULT '[]';
ALTER TABLE workspace_agent_runs ADD COLUMN approval_preview jsonb;
ALTER TABLE edit_deliveries DROP CONSTRAINT ck_edit_deliveries_kind;
ALTER TABLE edit_deliveries ADD CONSTRAINT ck_edit_deliveries_kind CHECK(kind IN ('trim','recut','transition','style'));
CREATE TABLE workspace_agent_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 follow boolean NOT NULL DEFAULT false,
 recommendations boolean NOT NULL DEFAULT true
);
ALTER TABLE workspace_agent_runs ADD COLUMN history_cleared_at timestamptz;
