"""add clip social caption columns

Revision ID: 20260630_social
Revises:
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "20260630_social"
down_revision = "20260629_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clips", sa.Column("caption_tiktok", sa.Text(), nullable=True))
    op.add_column("clips", sa.Column("caption_instagram", sa.Text(), nullable=True))
    op.add_column("clips", sa.Column("caption_youtube", sa.Text(), nullable=True))
    op.add_column("clips", sa.Column("suggested_hashtags", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("clips", "suggested_hashtags")
    op.drop_column("clips", "caption_youtube")
    op.drop_column("clips", "caption_instagram")
    op.drop_column("clips", "caption_tiktok")
