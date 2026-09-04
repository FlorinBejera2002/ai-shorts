"""Add stable media keys and edit lifecycle tracking.

Revision ID: 20260903_0006
Revises: 20260903_0005
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op

revision = "20260903_0006"
down_revision = "20260903_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs", sa.Column("source_storage_key", sa.String(2048), nullable=True)
    )
    op.add_column(
        "jobs",
        sa.Column(
            "processing_active",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "active_edit_tasks",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_jobs_active_edit_tasks_nonnegative",
        "jobs",
        "active_edit_tasks >= 0",
    )
    op.add_column(
        "clips", sa.Column("file_storage_key", sa.String(2048), nullable=True)
    )
    op.add_column(
        "clips", sa.Column("thumbnail_storage_key", sa.String(2048), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("clips", "thumbnail_storage_key")
    op.drop_column("clips", "file_storage_key")
    op.drop_constraint(
        "ck_jobs_active_edit_tasks_nonnegative", "jobs", type_="check"
    )
    op.drop_column("jobs", "active_edit_tasks")
    op.drop_column("jobs", "processing_active")
    op.drop_column("jobs", "source_storage_key")
