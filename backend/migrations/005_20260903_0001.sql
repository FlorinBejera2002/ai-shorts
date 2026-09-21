-- revision: 20260903_0001
-- parent: 20260707_0001
ALTER TABLE clips ADD CONSTRAINT uq_clips_id_user_id UNIQUE (id, user_id);

CREATE TABLE scheduled_posts (
    id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    clip_id UUID, 
    clip_owner_id UUID, 
    title VARCHAR(120) NOT NULL, 
    caption TEXT, 
    notes TEXT, 
    platforms VARCHAR(32)[], 
    status VARCHAR(32) DEFAULT 'draft' NOT NULL, 
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_scheduled_posts_status CHECK (status IN ('draft', 'scheduled', 'published')), 
    CONSTRAINT ck_scheduled_posts_platforms_not_empty CHECK (platforms IS NOT NULL AND cardinality(platforms) > 0), 
    CONSTRAINT ck_scheduled_posts_platforms_supported CHECK (platforms <@ ARRAY['tiktok', 'instagram', 'youtube', 'linkedin']::varchar[]), 
    CONSTRAINT ck_scheduled_posts_title_not_blank CHECK (length(btrim(title)) > 0), 
    CONSTRAINT ck_scheduled_posts_caption_length CHECK (caption IS NULL OR char_length(caption) <= 5000), 
    CONSTRAINT ck_scheduled_posts_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000), 
    CONSTRAINT ck_scheduled_posts_clip_owner CHECK ((clip_id IS NULL AND clip_owner_id IS NULL) OR (clip_id IS NOT NULL AND clip_owner_id = user_id)), 
    CONSTRAINT fk_scheduled_posts_owned_clip FOREIGN KEY(clip_id, clip_owner_id) REFERENCES clips (id, user_id) ON DELETE SET NULL ON UPDATE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX ix_scheduled_posts_user_scheduled_at ON scheduled_posts (user_id, scheduled_at);

CREATE INDEX ix_scheduled_posts_user_status ON scheduled_posts (user_id, status);

CREATE INDEX ix_scheduled_posts_clip_id ON scheduled_posts (clip_id);

