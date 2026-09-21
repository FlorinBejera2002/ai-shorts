-- revision: 20260904_0003
-- parent: 20260904_0002
ALTER TABLE jobs ADD COLUMN active_edit_token VARCHAR(36);

ALTER TABLE jobs ADD COLUMN edit_deadline TIMESTAMP WITH TIME ZONE;

CREATE INDEX ix_jobs_edit_deadline ON jobs (edit_deadline);

