-- revision: 20260906_0001
-- parent: 20260904_0004
CREATE TABLE edit_deliveries (
    id UUID NOT NULL, 
    job_id UUID NOT NULL, 
    clip_id UUID NOT NULL, 
    kind VARCHAR(10) NOT NULL, 
    task_id VARCHAR(36) NOT NULL, 
    reservation_token VARCHAR(36) NOT NULL, 
    execution_token VARCHAR(36), 
    payload JSONB NOT NULL, 
    state VARCHAR(20) DEFAULT 'pending' NOT NULL, 
    next_dispatch_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    dispatch_count INTEGER DEFAULT '0' NOT NULL, 
    last_error VARCHAR(200), 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_edit_deliveries_kind CHECK (kind IN ('trim', 'recut')), 
    CONSTRAINT ck_edit_deliveries_state CHECK (state IN ('pending', 'running', 'completed', 'failed', 'expired')), 
    FOREIGN KEY(job_id) REFERENCES jobs (id) ON DELETE CASCADE, 
    FOREIGN KEY(clip_id) REFERENCES clips (id) ON DELETE CASCADE, 
    UNIQUE (task_id), 
    UNIQUE (reservation_token)
);

CREATE INDEX ix_edit_deliveries_dispatch ON edit_deliveries (state, next_dispatch_at);

CREATE INDEX ix_edit_deliveries_clip_created ON edit_deliveries (clip_id, created_at);

