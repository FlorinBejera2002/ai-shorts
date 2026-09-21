-- revision: 20260707_0001
-- parent: 20260701_0001
ALTER TABLE jobs ADD COLUMN user_instructions TEXT;

ALTER TABLE jobs ADD COLUMN transcript_segments JSONB;

CREATE TABLE chat_messages (
    id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    clip_id UUID, 
    context VARCHAR(20) NOT NULL, 
    role VARCHAR(20) NOT NULL, 
    content TEXT NOT NULL, 
    actions JSONB, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(clip_id) REFERENCES clips (id) ON DELETE CASCADE
);

CREATE INDEX ix_chat_messages_user_id ON chat_messages (user_id);

CREATE INDEX ix_chat_messages_user_context_created ON chat_messages (user_id, context, created_at);

CREATE INDEX ix_chat_messages_clip_created ON chat_messages (clip_id, created_at);

