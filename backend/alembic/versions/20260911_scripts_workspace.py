"""Add persistent script workspaces and immutable versions.

Revision ID: 20260911_0002
Revises: 20260911_0001
Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_0002"
down_revision = "20260911_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE scripts (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(160) NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'draft',
      topic text NOT NULL DEFAULT '',
      platform varchar(32) NOT NULL DEFAULT 'tiktok',
      language varchar(16) NOT NULL DEFAULT 'en',
      target_duration_seconds integer NOT NULL DEFAULT 30,
      tone varchar(48) NOT NULL DEFAULT 'entertaining',
      style varchar(48) NOT NULL DEFAULT 'talking_head',
      audience text NOT NULL DEFAULT '',
      revision integer NOT NULL DEFAULT 1,
      current_version_id uuid,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT scripts_status_check CHECK (status IN ('idea','draft','review','ready','in_production','published','archived')),
      CONSTRAINT scripts_duration_check CHECK (target_duration_seconds BETWEEN 15 AND 180),
      UNIQUE (id, user_id)
    );

    CREATE TABLE script_versions (
      id uuid PRIMARY KEY,
      script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      version_number integer NOT NULL,
      snapshot jsonb NOT NULL,
      change_type varchar(24) NOT NULL,
      summary varchar(240) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT script_versions_change_type_check CHECK (change_type IN ('create','manual','generation','restore','import')),
      UNIQUE (script_id, version_number),
      UNIQUE (id, script_id)
    );

    ALTER TABLE scripts
      ADD CONSTRAINT scripts_current_version_fk
      FOREIGN KEY (current_version_id, id)
      REFERENCES script_versions(id, script_id)
      DEFERRABLE INITIALLY DEFERRED;

    CREATE INDEX ix_scripts_user_updated ON scripts(user_id, updated_at DESC, id DESC);
    CREATE INDEX ix_scripts_user_status ON scripts(user_id, status, updated_at DESC) WHERE archived_at IS NULL;
    CREATE INDEX ix_script_versions_script ON script_versions(script_id, version_number DESC);
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE scripts DROP CONSTRAINT scripts_current_version_fk;
    DROP TABLE script_versions;
    DROP TABLE scripts;
    """)
