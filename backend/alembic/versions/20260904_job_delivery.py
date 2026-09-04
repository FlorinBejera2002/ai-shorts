"""Durable job dispatch and fenced worker leases.

Drain old workers before deploying: old binaries do not enforce fencing.
Legacy active jobs are intentionally not automatically replayed.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260904_0002"
down_revision = "20260904_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "job_deliveries",
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("token", sa.String(36)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column(
            "next_dispatch_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("dispatch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(200)),
    )
    op.create_index(
        "ix_job_deliveries_next_dispatch_at", "job_deliveries", ["next_dispatch_at"]
    )


    op.create_index("ix_job_deliveries_lease_until", "job_deliveries", ["lease_until"])


def downgrade():
    op.drop_table("job_deliveries")
