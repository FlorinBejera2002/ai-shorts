-- revision: 20260917_clip_tiktok_asset
-- parent: 20260916_tiktok_options
-- Older installations may already have this column without the revision marker.
-- Adopt only the expected definition; never replace existing asset references.
ALTER TABLE clips ADD COLUMN IF NOT EXISTS tiktok_file_storage_key VARCHAR(2048);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'clips'::regclass
          AND attname = 'tiktok_file_storage_key'
          AND NOT attisdropped
          AND atttypid = 'varchar'::regtype
          AND atttypmod = 2052
          AND NOT attnotnull
          AND NOT atthasdef
    ) THEN
        RAISE EXCEPTION 'clips.tiktok_file_storage_key must be nullable VARCHAR(2048) without a default';
    END IF;
END $$;
