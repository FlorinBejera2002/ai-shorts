"""Add private TikTok delivery asset to clips.

Revision ID: 20260917_clip_tiktok_asset
Revises: 20260916_tiktok_options
"""

import sqlalchemy as sa
from alembic import op


revision = "20260917_clip_tiktok_asset"
down_revision = "20260916_tiktok_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clips",
        sa.Column("tiktok_file_storage_key", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clips", "tiktok_file_storage_key")
