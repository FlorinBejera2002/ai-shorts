-- revision: 20260629_0001
-- parent: base
CREATE TABLE users (
    id UUID NOT NULL, 
    email VARCHAR(255) NOT NULL, 
    name VARCHAR(255), 
    avatar_url VARCHAR(1024), 
    provider VARCHAR(50) NOT NULL, 
    provider_id VARCHAR(255), 
    password_hash VARCHAR(255), 
    email_verified TIMESTAMP WITH TIME ZONE, 
    credits INTEGER NOT NULL, 
    plan VARCHAR(50) NOT NULL, 
    stripe_customer_id VARCHAR(255), 
    stripe_subscription_id VARCHAR(255), 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE jobs (
    id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    source_type VARCHAR(50) NOT NULL, 
    source_url VARCHAR(2048), 
    source_file_path VARCHAR(2048), 
    status VARCHAR(50) NOT NULL, 
    progress INTEGER NOT NULL, 
    progress_message VARCHAR(512), 
    num_clips_requested INTEGER NOT NULL, 
    aspect_ratio VARCHAR(20) NOT NULL, 
    language VARCHAR(50), 
    subtitle_style VARCHAR(50) NOT NULL, 
    include_brand BOOLEAN NOT NULL, 
    credits_charged INTEGER NOT NULL, 
    error_message TEXT, 
    celery_task_id VARCHAR(255), 
    started_at TIMESTAMP WITH TIME ZONE, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_jobs_user_id ON jobs (user_id);

CREATE INDEX ix_jobs_status ON jobs (status);

CREATE TABLE brand_kits (
    id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    logo_path VARCHAR(2048), 
    logo_url VARCHAR(2048), 
    primary_color VARCHAR(20) NOT NULL, 
    secondary_color VARCHAR(20) NOT NULL, 
    font_family VARCHAR(100) NOT NULL, 
    subtitle_font VARCHAR(100) NOT NULL, 
    subtitle_color VARCHAR(20) NOT NULL, 
    subtitle_bg_color VARCHAR(20) NOT NULL, 
    subtitle_bg_opacity FLOAT NOT NULL, 
    subtitle_position VARCHAR(20) NOT NULL, 
    intro_video_path VARCHAR(2048), 
    outro_video_path VARCHAR(2048), 
    watermark_path VARCHAR(2048), 
    watermark_position VARCHAR(20) NOT NULL, 
    watermark_opacity FLOAT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ix_brand_kits_user_id ON brand_kits (user_id);

CREATE TABLE clips (
    id UUID NOT NULL, 
    job_id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    title VARCHAR(255) NOT NULL, 
    hook_text VARCHAR(255), 
    viral_score INTEGER NOT NULL, 
    score_reason TEXT, 
    start_time FLOAT NOT NULL, 
    end_time FLOAT NOT NULL, 
    duration FLOAT NOT NULL, 
    file_path VARCHAR(2048) NOT NULL, 
    file_url VARCHAR(2048), 
    thumbnail_path VARCHAR(2048), 
    thumbnail_url VARCHAR(2048), 
    file_size INTEGER NOT NULL, 
    resolution VARCHAR(50) NOT NULL, 
    aspect_ratio VARCHAR(20) NOT NULL, 
    has_subtitles BOOLEAN NOT NULL, 
    transcript_text TEXT, 
    published_to JSON, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(job_id) REFERENCES jobs (id) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_clips_job_id ON clips (job_id);

CREATE INDEX ix_clips_user_id ON clips (user_id);

CREATE TABLE accounts (
    user_id UUID NOT NULL, 
    type VARCHAR NOT NULL, 
    provider VARCHAR NOT NULL, 
    provider_account_id VARCHAR NOT NULL, 
    refresh_token TEXT, 
    access_token TEXT, 
    expires_at INTEGER, 
    token_type VARCHAR, 
    scope VARCHAR, 
    id_token TEXT, 
    session_state VARCHAR, 
    PRIMARY KEY (provider, provider_account_id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE sessions (
    session_token VARCHAR NOT NULL, 
    user_id UUID NOT NULL, 
    expires TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (session_token), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE verification_tokens (
    identifier VARCHAR NOT NULL, 
    token VARCHAR NOT NULL, 
    expires TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (identifier, token)
);

