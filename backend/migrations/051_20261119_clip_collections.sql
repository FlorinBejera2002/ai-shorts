-- revision: 20261119_clip_collections
-- parent: 20261117_youtube_import
-- Clips page projects belong to the account, not to one source video: a folder without a job
-- can hold clips from any source. Existing job folders keep working unchanged.
ALTER TABLE project_folders ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE project_folders ADD CONSTRAINT project_folders_collection_root CHECK (job_id IS NOT NULL OR parent_id IS NULL);

-- Migration 019 made (job_id, parent_id, name) unique with NULLS NOT DISTINCT. Account projects
-- have job_id and parent_id NULL, so that constraint would make project names unique across all
-- accounts. Keep it for job folders only; account projects are unique per user below.
DO $$
DECLARE stale text;
BEGIN
  SELECT c.conname INTO stale
  FROM pg_constraint c
  WHERE c.conrelid = 'project_folders'::regclass
    AND c.contype = 'u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
         FROM unnest(c.conkey) AS k(attnum)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) = ARRAY['job_id', 'name', 'parent_id'];
  IF stale IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_folders DROP CONSTRAINT %I', stale);
  END IF;
END $$;
CREATE UNIQUE INDEX ux_project_folders_job_name ON project_folders(job_id, parent_id, name) NULLS NOT DISTINCT WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX ux_project_folders_collection_name ON project_folders(user_id, lower(name)) WHERE job_id IS NULL;
