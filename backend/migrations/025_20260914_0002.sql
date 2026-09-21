-- revision: 20260914_0002
-- parent: 20260914_0001
ALTER TABLE scheduled_posts
      ADD COLUMN account_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      ADD COLUMN publishing_error text NOT NULL DEFAULT '';

    ALTER TABLE scheduled_posts DROP CONSTRAINT ck_scheduled_posts_status;
    ALTER TABLE scheduled_posts ADD CONSTRAINT ck_scheduled_posts_status
      CHECK(status IN ('draft','scheduled','publishing','published','failed'));

    ALTER TABLE scheduled_posts DROP CONSTRAINT ck_scheduled_posts_platforms_supported;
    ALTER TABLE scheduled_posts ADD CONSTRAINT ck_scheduled_posts_platforms_supported
      CHECK(platforms <@ ARRAY['tiktok','instagram','facebook','youtube','linkedin']::varchar[]);

    -- Historical calendar rows never selected concrete destinations. Keep them
    -- visible, but do not silently publish them after this migration.
    UPDATE scheduled_posts SET status='draft'
      WHERE status='scheduled' AND cardinality(account_ids)=0;

    ALTER TABLE scheduled_posts ADD CONSTRAINT ck_scheduled_posts_accounts
      CHECK(status NOT IN ('scheduled','publishing') OR cardinality(account_ids)>0);

    ALTER TABLE social_posts
      ADD COLUMN scheduled_post_id uuid REFERENCES scheduled_posts(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX uq_social_posts_calendar_account
      ON social_posts(scheduled_post_id, account_id)
      WHERE scheduled_post_id IS NOT NULL;
    CREATE INDEX ix_social_posts_scheduled_post ON social_posts(scheduled_post_id)
      WHERE scheduled_post_id IS NOT NULL;;

