-- revision: 20261013_agent_source_resources
-- parent: 20260930_admin_console
ALTER TABLE workspace_agent_resources
    ADD COLUMN source_project_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_agent_resource_single_project
        CHECK (project_id IS NULL OR source_project_id IS NULL);

CREATE INDEX ix_agent_resources_source_project
    ON workspace_agent_resources(user_id, source_project_id)
    WHERE source_project_id IS NOT NULL;
