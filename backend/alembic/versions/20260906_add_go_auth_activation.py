"""Preserve existing sign-in while allowing verification for new registrations.

Revision ID: 20260906_0002
Revises: 20260906_0001
"""
import sqlalchemy as sa
from alembic import op

revision = "20260906_0002"
down_revision = "20260906_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_activation_required", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade():
    op.drop_column("users", "email_activation_required")
