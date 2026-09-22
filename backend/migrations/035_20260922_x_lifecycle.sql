-- revision: 20260922_x_lifecycle
-- parent: 20260922_linkedin_lifecycle

ALTER TABLE social_accounts
    ADD COLUMN IF NOT EXISTS x_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS x_check_after timestamptz,
    ADD COLUMN IF NOT EXISTS x_consent_at timestamptz;

UPDATE social_accounts
SET x_verified_at = COALESCE(x_verified_at, now()),
    x_check_after = COALESCE(x_check_after, now())
WHERE provider = 'twitter';

CREATE INDEX IF NOT EXISTS idx_social_accounts_x_maintenance
    ON social_accounts (x_check_after)
    WHERE provider = 'twitter' AND status = 'connected';
