"""Store profile pictures for connected social accounts."""

from alembic import op

revision = "20260915_0002"
down_revision = "20260915_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE social_accounts ADD COLUMN avatar_url text NOT NULL DEFAULT '';"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE social_accounts DROP COLUMN avatar_url;")
