"""initial schema

Revision ID: 20260629_0001
Revises: None
Create Date: 2026-06-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260629_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=1024), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("provider_id", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("email_verified", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("plan", sa.String(length=50), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("source_file_path", sa.String(length=2048), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("progress_message", sa.String(length=512), nullable=True),
        sa.Column("num_clips_requested", sa.Integer(), nullable=False),
        sa.Column("aspect_ratio", sa.String(length=20), nullable=False),
        sa.Column("language", sa.String(length=50), nullable=True),
        sa.Column("subtitle_style", sa.String(length=50), nullable=False),
        sa.Column("include_brand", sa.Boolean(), nullable=False),
        sa.Column("credits_charged", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
    op.create_index("ix_jobs_status", "jobs", ["status"])

    op.create_table(
        "brand_kits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("logo_path", sa.String(length=2048), nullable=True),
        sa.Column("logo_url", sa.String(length=2048), nullable=True),
        sa.Column("primary_color", sa.String(length=20), nullable=False),
        sa.Column("secondary_color", sa.String(length=20), nullable=False),
        sa.Column("font_family", sa.String(length=100), nullable=False),
        sa.Column("subtitle_font", sa.String(length=100), nullable=False),
        sa.Column("subtitle_color", sa.String(length=20), nullable=False),
        sa.Column("subtitle_bg_color", sa.String(length=20), nullable=False),
        sa.Column("subtitle_bg_opacity", sa.Float(), nullable=False),
        sa.Column("subtitle_position", sa.String(length=20), nullable=False),
        sa.Column("intro_video_path", sa.String(length=2048), nullable=True),
        sa.Column("outro_video_path", sa.String(length=2048), nullable=True),
        sa.Column("watermark_path", sa.String(length=2048), nullable=True),
        sa.Column("watermark_position", sa.String(length=20), nullable=False),
        sa.Column("watermark_opacity", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_brand_kits_user_id", "brand_kits", ["user_id"], unique=True)

    op.create_table(
        "clips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("hook_text", sa.String(length=255), nullable=True),
        sa.Column("viral_score", sa.Integer(), nullable=False),
        sa.Column("score_reason", sa.Text(), nullable=True),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("file_path", sa.String(length=2048), nullable=False),
        sa.Column("file_url", sa.String(length=2048), nullable=True),
        sa.Column("thumbnail_path", sa.String(length=2048), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=2048), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("resolution", sa.String(length=50), nullable=False),
        sa.Column("aspect_ratio", sa.String(length=20), nullable=False),
        sa.Column("has_subtitles", sa.Boolean(), nullable=False),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column("published_to", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_clips_job_id", "clips", ["job_id"])
    op.create_index("ix_clips_user_id", "clips", ["user_id"])

    op.create_table(
        "accounts",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_account_id", sa.String(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.Integer(), nullable=True),
        sa.Column("token_type", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=True),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("session_state", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("provider", "provider_account_id"),
    )

    op.create_table(
        "sessions",
        sa.Column("session_token", sa.String(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "verification_tokens",
        sa.Column("identifier", sa.String(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("identifier", "token"),
    )


def downgrade() -> None:
    op.drop_table("verification_tokens")
    op.drop_table("sessions")
    op.drop_table("accounts")
    op.drop_index("ix_clips_user_id", table_name="clips")
    op.drop_index("ix_clips_job_id", table_name="clips")
    op.drop_table("clips")
    op.drop_index("ix_brand_kits_user_id", table_name="brand_kits")
    op.drop_table("brand_kits")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_user_id", table_name="jobs")
    op.drop_table("jobs")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
