-- revision: 20260922_x_lifecycle_removed
-- parent: 20260922_x_lifecycle

DROP INDEX IF EXISTS idx_social_accounts_x_maintenance;

ALTER TABLE social_accounts
    DROP COLUMN IF EXISTS x_verified_at,
    DROP COLUMN IF EXISTS x_check_after,
    DROP COLUMN IF EXISTS x_consent_at;
