"""Persist TikTok options for scheduled posts.

Revision ID: 20260916_tiktok_options
Revises: 20260915_post_media
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260916_tiktok_options"
down_revision = "20260915_post_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scheduled_posts",
        sa.Column(
            "tiktok_options",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("scheduled_posts", "tiktok_options")
