-- revision: 20261015_studio_compositions
-- parent: 20261014_caption_styles
ALTER TABLE clips ADD COLUMN IF NOT EXISTS studio_artifact_id uuid;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS tiktok_studio_artifact_id uuid;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS preview_storage_key text;
CREATE INDEX IF NOT EXISTS clips_studio_artifact_idx ON clips(studio_artifact_id) WHERE studio_artifact_id IS NOT NULL;
