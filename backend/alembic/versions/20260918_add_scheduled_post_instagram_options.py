"""Persist Instagram options for scheduled posts.

Revision ID: 20260918_ig_options
Revises: 20260917_clip_tiktok_asset
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260918_ig_options"
down_revision = "20260917_clip_tiktok_asset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scheduled_posts",
        sa.Column(
            "instagram_options",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("scheduled_posts", "instagram_options")
