"""Add segments to clips and source_video_url to jobs

Revision ID: 20260701_0001
Revises: 20260630_social
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260701_0001"
down_revision = "20260630_social"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clips", sa.Column("segments", JSONB, nullable=True))
    op.add_column("jobs", sa.Column("source_video_url", sa.String(2048), nullable=True))

    # Backfill existing clips: create segments from startTime/endTime
    op.execute("""
        UPDATE clips
        SET segments = jsonb_build_array(
            jsonb_build_object('start', start_time, 'end', end_time, 'order', 0)
        )
        WHERE segments IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column("jobs", "source_video_url")
    op.drop_column("clips", "segments")
