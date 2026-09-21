-- revision: 20260903_0006
-- parent: 20260903_0005
ALTER TABLE jobs ADD COLUMN source_storage_key VARCHAR(2048);

ALTER TABLE jobs ADD COLUMN processing_active BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE jobs ADD COLUMN active_edit_tasks INTEGER DEFAULT '0' NOT NULL;

ALTER TABLE jobs ADD CONSTRAINT ck_jobs_active_edit_tasks_nonnegative CHECK (active_edit_tasks >= 0);

ALTER TABLE clips ADD COLUMN file_storage_key VARCHAR(2048);

ALTER TABLE clips ADD COLUMN thumbnail_storage_key VARCHAR(2048);

