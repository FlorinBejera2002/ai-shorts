-- revision: 20260915_0001
-- parent: 20260914_0002
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
      ));;

