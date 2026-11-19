-- revision: 20261119_clip_collections
-- parent: 20261117_youtube_import
-- Clips page projects belong to the account, not to one source video: a folder without a job
-- can hold clips from any source. Existing job folders keep working unchanged.
ALTER TABLE project_folders ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE project_folders ADD CONSTRAINT project_folders_collection_root CHECK (job_id IS NOT NULL OR parent_id IS NULL);
CREATE UNIQUE INDEX ux_project_folders_collection_name ON project_folders(user_id, lower(name)) WHERE job_id IS NULL;
