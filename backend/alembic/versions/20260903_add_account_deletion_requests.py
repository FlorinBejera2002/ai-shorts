"""Add durable account-deletion work items.

Revision ID: 20260903_0004
Revises: 20260903_0003
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260903_0004"
down_revision = "20260903_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_deletion_requests",
        # Intentionally no FK: the work item must not cascade away before the
        # account-deletion transaction can remove both records atomically.
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column(
            "billing_cancellation_completed",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("last_failure", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "last_failure IS NULL OR last_failure IN ("
            "'billing_unavailable', "
            "'billing_cancellation_failed', "
            "'media_cleanup_failed', "
            "'database_deletion_failed'"
            ")",
            name="ck_account_deletion_requests_last_failure",
        ),
    )


def downgrade() -> None:
    op.drop_table("account_deletion_requests")
