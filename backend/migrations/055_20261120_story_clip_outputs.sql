-- revision: 20261120_story_clip_outputs
-- parent: 20261120_youtube_channel
-- A multi-clip story saves one Clips library row per output. The output index keeps each clip row's identity stable; existing single-clip rows are index 0.
ALTER TABLE clips ADD COLUMN story_output_index INTEGER NOT NULL DEFAULT 0 CHECK (story_output_index >= 0);
DROP INDEX ix_story_current_clip;
CREATE UNIQUE INDEX ix_story_current_clip ON clips(story_project_id, story_output_index) WHERE story_project_id IS NOT NULL;
