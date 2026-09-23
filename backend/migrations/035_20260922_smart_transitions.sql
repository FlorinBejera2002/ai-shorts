-- revision: 20260922_smart_transitions
-- parent: 20260922_linkedin_lifecycle
ALTER TABLE clips ADD COLUMN transition_state JSONB;
ALTER TABLE edit_deliveries DROP CONSTRAINT ck_edit_deliveries_kind;
ALTER TABLE edit_deliveries ADD CONSTRAINT ck_edit_deliveries_kind CHECK (kind IN ('trim', 'recut', 'transition'));
