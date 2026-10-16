-- revision: 20261016_logo_position
-- parent: 20261015_studio_compositions
ALTER TABLE brand_kits
    ADD COLUMN watermark_x double precision,
    ADD COLUMN watermark_y double precision,
    ADD CONSTRAINT brand_logo_center CHECK (
        (watermark_x IS NULL AND watermark_y IS NULL) OR
        (watermark_x IS NOT NULL AND watermark_y IS NOT NULL AND
         watermark_x BETWEEN 0 AND 1 AND watermark_y BETWEEN 0 AND 1)
    );
