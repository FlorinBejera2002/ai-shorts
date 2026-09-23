-- revision: 20260923_project_agent_edits
-- parent: 20260922_workspace_agent
CREATE TABLE project_agent_edits (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id UUID NOT NULL,
 project_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 input JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
