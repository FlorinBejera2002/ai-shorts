-- revision: 20260911_0001
-- parent: 20260907_0001
ALTER TABLE jobs ADD COLUMN project_name varchar(120);
    ALTER TABLE jobs ADD COLUMN project_brand jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE project_folders (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      parent_id uuid REFERENCES project_folders(id) ON DELETE CASCADE,
      name varchar(80) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id, user_id, job_id),
      UNIQUE NULLS NOT DISTINCT(job_id, parent_id, name)
    );
    CREATE INDEX ix_project_folders_project ON project_folders(user_id, job_id);

    ALTER TABLE clips ADD COLUMN folder_id uuid REFERENCES project_folders(id) ON DELETE SET NULL;
    CREATE INDEX ix_clips_folder ON clips(folder_id) WHERE folder_id IS NOT NULL;;

