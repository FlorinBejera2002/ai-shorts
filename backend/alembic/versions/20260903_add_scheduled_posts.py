"""Add user-owned content calendar entries.

Revision ID: 20260903_0001
Revises: 20260707_0001
Create Date: 2026-09-03
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260903_0001"
down_revision = "20260707_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_clips_id_user_id",
        "clips",
        ["id", "user_id"],
    )
    op.create_table(
        "scheduled_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("clip_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("clip_owner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "platforms",
            postgresql.ARRAY(sa.String(32)),
            # Prisma scalar-list columns are physically nullable; the check below
            # enforces the product's stronger non-null and non-empty invariant.
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(32),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'scheduled', 'published')",
            name="ck_scheduled_posts_status",
        ),
        sa.CheckConstraint(
            "platforms IS NOT NULL AND cardinality(platforms) > 0",
            name="ck_scheduled_posts_platforms_not_empty",
        ),
        sa.CheckConstraint(
            "platforms <@ ARRAY['tiktok', 'instagram', 'youtube', 'linkedin']::varchar[]",
            name="ck_scheduled_posts_platforms_supported",
        ),
        sa.CheckConstraint(
            "length(btrim(title)) > 0",
            name="ck_scheduled_posts_title_not_blank",
        ),
        sa.CheckConstraint(
            "caption IS NULL OR char_length(caption) <= 5000",
            name="ck_scheduled_posts_caption_length",
        ),
        sa.CheckConstraint(
            "notes IS NULL OR char_length(notes) <= 2000",
            name="ck_scheduled_posts_notes_length",
        ),
        sa.CheckConstraint(
            "(clip_id IS NULL AND clip_owner_id IS NULL) "
            "OR (clip_id IS NOT NULL AND clip_owner_id = user_id)",
            name="ck_scheduled_posts_clip_owner",
        ),
        sa.ForeignKeyConstraint(
            ["clip_id", "clip_owner_id"],
            ["clips.id", "clips.user_id"],
            name="fk_scheduled_posts_owned_clip",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
    )
    op.create_index(
        "ix_scheduled_posts_user_scheduled_at",
        "scheduled_posts",
        ["user_id", "scheduled_at"],
    )
    op.create_index(
        "ix_scheduled_posts_user_status",
        "scheduled_posts",
        ["user_id", "status"],
    )
    op.create_index("ix_scheduled_posts_clip_id", "scheduled_posts", ["clip_id"])


def downgrade() -> None:
    op.drop_table("scheduled_posts")
    op.drop_constraint("uq_clips_id_user_id", "clips", type_="unique")
