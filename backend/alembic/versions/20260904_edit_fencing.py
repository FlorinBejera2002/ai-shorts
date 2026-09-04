"""Bounded edit reservations; drain legacy workers before deploying."""

import sqlalchemy as sa
from alembic import op

revision = "20260904_0003"
down_revision = "20260904_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("active_edit_token", sa.String(36)))
    op.add_column("jobs", sa.Column("edit_deadline", sa.DateTime(timezone=True)))
    op.create_index("ix_jobs_edit_deadline", "jobs", ["edit_deadline"])


def downgrade():
    op.drop_index("ix_jobs_edit_deadline", table_name="jobs")
    op.drop_column("jobs", "edit_deadline")
    op.drop_column("jobs", "active_edit_token")
