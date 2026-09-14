"""Allow YouTube social accounts."""

from alembic import op

revision = "20260914_0001"
down_revision = "20260911_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_provider_check;
    ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_provider_check
      CHECK(provider IN ('instagram','facebook','tiktok','youtube'));
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM social_accounts WHERE provider='youtube';
    ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_provider_check;
    ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_provider_check
      CHECK(provider IN ('instagram','facebook','tiktok'));
    """)
