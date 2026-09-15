"""Prepare calendar and social accounts for LinkedIn and X."""

from alembic import op

revision = "20260915_0001"
down_revision = "20260914_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE scheduled_posts
      DROP CONSTRAINT IF EXISTS ck_scheduled_posts_platforms_supported;
    ALTER TABLE scheduled_posts
      ADD CONSTRAINT ck_scheduled_posts_platforms_supported
      CHECK(platforms <@ ARRAY[
        'tiktok','instagram','facebook','youtube','linkedin','twitter'
      ]::varchar[]);

    ALTER TABLE social_accounts
      DROP CONSTRAINT IF EXISTS social_accounts_provider_check;
    ALTER TABLE social_accounts
      ADD CONSTRAINT social_accounts_provider_check
      CHECK(provider IN (
        'instagram','facebook','tiktok','youtube','linkedin','twitter'
      ));
    """)


def downgrade() -> None:
    op.execute("""
    DELETE FROM social_accounts WHERE provider IN ('linkedin','twitter');
    UPDATE scheduled_posts
      SET platforms = CASE
        WHEN cardinality(array_remove(platforms, 'twitter')) = 0
          THEN ARRAY['tiktok']::varchar[]
        ELSE array_remove(platforms, 'twitter')
      END
      WHERE platforms @> ARRAY['twitter']::varchar[];

    ALTER TABLE social_accounts
      DROP CONSTRAINT IF EXISTS social_accounts_provider_check;
    ALTER TABLE social_accounts
      ADD CONSTRAINT social_accounts_provider_check
      CHECK(provider IN ('instagram','facebook','tiktok','youtube'));

    ALTER TABLE scheduled_posts
      DROP CONSTRAINT IF EXISTS ck_scheduled_posts_platforms_supported;
    ALTER TABLE scheduled_posts
      ADD CONSTRAINT ck_scheduled_posts_platforms_supported
      CHECK(platforms <@ ARRAY[
        'tiktok','instagram','facebook','youtube','linkedin'
      ]::varchar[]);
    """)
