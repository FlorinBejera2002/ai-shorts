-- revision: 20260914_0001
-- parent: 20260911_0006
ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_provider_check;
    ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_provider_check
      CHECK(provider IN ('instagram','facebook','tiktok','youtube'));;

