-- revision: 20260904_0002
-- parent: 20260904_0001
CREATE TABLE job_deliveries (
    job_id UUID NOT NULL, 
    payload JSONB NOT NULL, 
    token VARCHAR(36), 
    lease_until TIMESTAMP WITH TIME ZONE, 
    next_dispatch_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    dispatch_count INTEGER DEFAULT '0' NOT NULL, 
    execution_count INTEGER DEFAULT '0' NOT NULL, 
    last_error VARCHAR(200), 
    PRIMARY KEY (job_id), 
    FOREIGN KEY(job_id) REFERENCES jobs (id) ON DELETE CASCADE
);

CREATE INDEX ix_job_deliveries_next_dispatch_at ON job_deliveries (next_dispatch_at);

CREATE INDEX ix_job_deliveries_lease_until ON job_deliveries (lease_until);

