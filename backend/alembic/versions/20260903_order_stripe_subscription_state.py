"""Order Stripe subscription state transitions.

Revision ID: 20260903_0005
Revises: 20260903_0004
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op

revision = "20260903_0005"
down_revision = "20260903_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "stripe_state_event_created",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "stripe_state_event_priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "stripe_state_event_priority")
    op.drop_column("users", "stripe_state_event_created")
