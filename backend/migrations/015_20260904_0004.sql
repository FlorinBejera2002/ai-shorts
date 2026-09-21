-- revision: 20260904_0004
-- parent: 20260904_0003
ALTER TABLE users ADD COLUMN access_role VARCHAR(20) DEFAULT 'member' NOT NULL;

ALTER TABLE users ADD CONSTRAINT ck_users_access_role CHECK (access_role IN ('member', 'viewer'));

