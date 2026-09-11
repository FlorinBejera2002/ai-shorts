"""Add project workspaces, clip folders and project-scoped brand settings."""

from alembic import op

revision = "20260911_0001"
down_revision = "20260907_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
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
    CREATE INDEX ix_clips_folder ON clips(folder_id) WHERE folder_id IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX ix_clips_folder;
    ALTER TABLE clips DROP COLUMN folder_id;
    DROP TABLE project_folders;
    ALTER TABLE jobs DROP COLUMN project_brand;
    ALTER TABLE jobs DROP COLUMN project_name;
    """)
