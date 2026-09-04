"""Add durable Stripe billing state and webhook idempotency ledger.

Revision ID: 20260903_0002
Revises: 20260903_0001
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op

revision = "20260903_0002"
down_revision = "20260903_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stripe_subscription_status", sa.String(50), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "stripe_current_period_end",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "stripe_cancel_at_period_end",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_index(
        "uq_users_stripe_customer_id",
        "users",
        ["stripe_customer_id"],
        unique=True,
    )
    op.create_index(
        "uq_users_stripe_subscription_id",
        "users",
        ["stripe_subscription_id"],
        unique=True,
    )

    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("credit_grant_id", sa.String(255), nullable=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "uq_stripe_events_credit_grant_id",
        "stripe_events",
        ["credit_grant_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("stripe_events")
    op.drop_index("uq_users_stripe_subscription_id", table_name="users")
    op.drop_index("uq_users_stripe_customer_id", table_name="users")
    op.drop_column("users", "stripe_cancel_at_period_end")
    op.drop_column("users", "stripe_current_period_end")
    op.drop_column("users", "stripe_subscription_status")
