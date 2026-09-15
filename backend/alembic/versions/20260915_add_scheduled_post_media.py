"""add scheduled post media

Revision ID: 20260915_post_media
Revises: 20260915_0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260915_post_media"
down_revision = "20260915_0002"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        "scheduled_posts",
        sa.Column(
            "media",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

def downgrade() -> None:
    op.drop_column("scheduled_posts", "media")
