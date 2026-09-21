-- revision: 20260911_0003
-- parent: 20260911_0002
ALTER TABLE users ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false;

    ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE sessions ADD COLUMN user_agent varchar(255) NOT NULL DEFAULT '';
    ALTER TABLE sessions ADD COLUMN ip_hash varchar(64) NOT NULL DEFAULT '';
    ALTER TABLE sessions ADD CONSTRAINT sessions_id_unique UNIQUE(id);
    CREATE INDEX ix_sessions_user_activity ON sessions(user_id, last_seen_at DESC);

    CREATE TABLE account_preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      locale varchar(8) NOT NULL DEFAULT 'en',
      theme varchar(16) NOT NULL DEFAULT 'system',
      timezone varchar(64) NOT NULL DEFAULT 'UTC',
      default_aspect_ratio varchar(8) NOT NULL DEFAULT '9:16',
      default_clip_count smallint NOT NULL DEFAULT 3,
      email_security boolean NOT NULL DEFAULT true,
      email_product boolean NOT NULL DEFAULT true,
      email_marketing boolean NOT NULL DEFAULT false,
      in_app_processing boolean NOT NULL DEFAULT true,
      in_app_publishing boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(locale IN ('en','ro')),
      CHECK(theme IN ('light','dark','system')),
      CHECK(default_aspect_ratio IN ('9:16','1:1','16:9')),
      CHECK(default_clip_count BETWEEN 1 AND 10)
    );

    CREATE TABLE account_mfa (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_ciphertext text NOT NULL,
      recovery_code_hashes text[] NOT NULL DEFAULT '{}',
      enabled boolean NOT NULL DEFAULT false,
      pending_expires_at timestamptz,
      enabled_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE account_security_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type varchar(64) NOT NULL,
      detail varchar(240) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_account_security_events_user ON account_security_events(user_id, created_at DESC);

    CREATE TABLE account_data_exports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(16) NOT NULL DEFAULT 'completed',
      requested_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      CHECK(status IN ('pending','processing','completed','failed'))
    );
    CREATE INDEX ix_account_data_exports_user ON account_data_exports(user_id, requested_at DESC);

    ALTER TABLE social_accounts ADD COLUMN scopes text[] NOT NULL DEFAULT '{}';
    ALTER TABLE social_accounts ADD COLUMN token_expires_at timestamptz;;

