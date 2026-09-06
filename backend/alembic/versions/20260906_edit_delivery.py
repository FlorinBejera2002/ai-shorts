"""Durable edit dispatch between the native API and retained Python workers."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260906_0001"
down_revision = "20260904_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "edit_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "clip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("task_id", sa.String(36), nullable=False, unique=True),
        sa.Column("reservation_token", sa.String(36), nullable=False, unique=True),
        sa.Column("execution_token", sa.String(36)),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "next_dispatch_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("dispatch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(200)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("kind IN ('trim', 'recut')", name="ck_edit_deliveries_kind"),
        sa.CheckConstraint(
            "state IN ('pending', 'running', 'completed', 'failed', 'expired')",
            name="ck_edit_deliveries_state",
        ),
    )
    op.create_index(
        "ix_edit_deliveries_dispatch", "edit_deliveries", ["state", "next_dispatch_at"]
    )
    op.create_index(
        "ix_edit_deliveries_clip_created", "edit_deliveries", ["clip_id", "created_at"]
    )


def downgrade():
    op.drop_table("edit_deliveries")
