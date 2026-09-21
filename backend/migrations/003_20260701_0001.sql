-- revision: 20260701_0001
-- parent: 20260630_social
ALTER TABLE clips ADD COLUMN segments JSONB;

ALTER TABLE jobs ADD COLUMN source_video_url VARCHAR(2048);

UPDATE clips
        SET segments = jsonb_build_array(
            jsonb_build_object('start', start_time, 'end', end_time, 'order', 0)
        )
        WHERE segments IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL;

