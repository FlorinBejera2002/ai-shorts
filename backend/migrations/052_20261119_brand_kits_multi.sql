-- revision: 20261119_brand_kits_multi
-- parent: 20261119_clip_collections
-- An account can keep several named brand kits. Exactly one is the default: every existing
-- single-kit read (agent, renderer fallback, /api/user/brand) keeps using that one.
ALTER TABLE brand_kits ADD COLUMN name varchar(80) NOT NULL DEFAULT 'Kit principal';
ALTER TABLE brand_kits ADD COLUMN is_default boolean NOT NULL DEFAULT false;
ALTER TABLE brand_kits ADD COLUMN image_path varchar(2048);
UPDATE brand_kits SET is_default = true;
DROP INDEX ix_brand_kits_user_id;
CREATE INDEX ix_brand_kits_user_id ON brand_kits (user_id);
CREATE UNIQUE INDEX ux_brand_kits_default ON brand_kits (user_id) WHERE is_default;
CREATE UNIQUE INDEX ux_brand_kits_name ON brand_kits (user_id, lower(name));
