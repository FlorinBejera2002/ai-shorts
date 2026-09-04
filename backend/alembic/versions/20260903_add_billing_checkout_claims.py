"""Serialize billing checkouts and order subscription generations.

Revision ID: 20260903_0007
Revises: 20260903_0006
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op

revision = "20260903_0007"
down_revision = "20260903_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "account_deletion_requests",
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "stripe_checkout_generation",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "stripe_state_generation",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.create_table(
        "billing_checkout_claims",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("plan_id", sa.String(32), nullable=False),
        sa.Column("price_id", sa.String(255), nullable=False),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=True),
        sa.Column("customer_email", sa.String(255), nullable=False),
        sa.Column("success_url", sa.String(2048), nullable=False),
        sa.Column("cancel_url", sa.String(2048), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "checkout_expires_at", sa.DateTime(timezone=True), nullable=False
        ),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint(
            "session_id", name="uq_billing_checkout_claims_session_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("billing_checkout_claims")
    op.drop_column("users", "stripe_state_generation")
    op.drop_column("users", "stripe_checkout_generation")
    op.drop_column("account_deletion_requests", "stripe_customer_id")
