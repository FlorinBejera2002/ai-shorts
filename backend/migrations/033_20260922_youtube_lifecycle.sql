-- revision: 20260922_youtube_lifecycle
-- parent: 20260922_youtube_options
ALTER TABLE social_accounts ADD COLUMN youtube_verified_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE social_accounts ADD COLUMN youtube_check_after TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE social_accounts ADD COLUMN youtube_consent_at TIMESTAMPTZ;
CREATE INDEX social_accounts_youtube_maintenance ON social_accounts(youtube_check_after) WHERE provider='youtube';
