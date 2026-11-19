-- revision: 20261119_clip_favorites
-- parent: 20261119_brand_kits_multi
-- A clip can be starred; the Clips library shows starred clips under "Favorite".
ALTER TABLE clips ADD COLUMN favorite boolean NOT NULL DEFAULT false;
