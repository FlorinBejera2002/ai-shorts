-- revision: 20260922_linkedin_lifecycle
-- parent: 20260922_youtube_lifecycle
ALTER TABLE social_accounts ADD COLUMN linkedin_verified_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE social_accounts ADD COLUMN linkedin_check_after TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE social_accounts ADD COLUMN linkedin_consent_at TIMESTAMPTZ;
CREATE INDEX social_accounts_linkedin_maintenance ON social_accounts(linkedin_check_after) WHERE provider='linkedin';
