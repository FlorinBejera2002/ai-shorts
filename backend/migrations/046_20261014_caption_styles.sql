-- revision: 20261014_caption_styles
-- parent: 20261014_ai_stage_routing
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS caption_style jsonb;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS watermark_size double precision NOT NULL DEFAULT 0.18;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS watermark_margin double precision NOT NULL DEFAULT 0.025;
CREATE TABLE IF NOT EXISTS caption_fonts (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 family text NOT NULL,
 style text NOT NULL,
 weight integer NOT NULL CHECK (weight BETWEEN 100 AND 900),
 romanian boolean NOT NULL,
 digest text NOT NULL,
 storage_key text NOT NULL UNIQUE,
 archived boolean NOT NULL DEFAULT false,
 license_confirmed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS caption_fonts_owner ON caption_fonts(user_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS brand_snapshot jsonb;
ALTER TABLE story_projects ADD COLUMN IF NOT EXISTS brand_snapshot jsonb;
