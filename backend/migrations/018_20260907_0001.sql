-- revision: 20260907_0001
-- parent: 20260906_0002
ALTER TABLE clips ADD COLUMN contains_platform_badge boolean;
    CREATE TABLE social_accounts (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider text NOT NULL CHECK(provider IN ('instagram','facebook','tiktok')),
      remote_id text NOT NULL, name text NOT NULL, username text NOT NULL DEFAULT '',
      credentials text NOT NULL, status text NOT NULL DEFAULT 'connected',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,provider,remote_id), UNIQUE(id,user_id)
    );
    CREATE TABLE social_oauth_states (
      state_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider text NOT NULL, browser_hash text NOT NULL, verifier text NOT NULL,
      locale text NOT NULL, session_version integer NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE social_posts (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id uuid NOT NULL, clip_id uuid REFERENCES clips(id) ON DELETE SET NULL,
      provider text NOT NULL, caption text NOT NULL, options jsonb NOT NULL,
      media_reference text NOT NULL,
      idempotency_key text NOT NULL, request_hash text NOT NULL,
      status text NOT NULL DEFAULT 'queued', remote_id text NOT NULL DEFAULT '',
      error text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      finalized boolean NOT NULL DEFAULT false,
      FOREIGN KEY(account_id,user_id) REFERENCES social_accounts(id,user_id) ON DELETE CASCADE,
      UNIQUE(user_id,account_id,idempotency_key),
      CHECK(status IN ('queued','submitting','processing','finalizing','published','failed','unknown','cancelled'))
    );
    CREATE INDEX ix_social_posts_pending ON social_posts(next_attempt_at) WHERE status IN ('queued','processing');
    CREATE INDEX ix_social_posts_user ON social_posts(user_id,created_at DESC);
    CREATE INDEX ix_social_oauth_expiry ON social_oauth_states(expires_at);;

