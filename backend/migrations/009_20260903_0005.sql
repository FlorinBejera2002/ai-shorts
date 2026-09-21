-- revision: 20260903_0005
-- parent: 20260903_0004
ALTER TABLE users ADD COLUMN stripe_state_event_created BIGINT DEFAULT '0' NOT NULL;

ALTER TABLE users ADD COLUMN stripe_state_event_priority INTEGER DEFAULT '0' NOT NULL;

