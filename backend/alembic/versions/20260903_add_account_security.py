"""Add account session invalidation state.

Revision ID: 20260903_0003
Revises: 20260903_0002
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op

revision = "20260903_0003"
down_revision = "20260903_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "session_version",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "session_version")
