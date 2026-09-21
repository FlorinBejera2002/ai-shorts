-- revision: 20260903_0004
-- parent: 20260903_0003
CREATE TABLE account_deletion_requests (
    user_id UUID NOT NULL, 
    stripe_subscription_id VARCHAR(255), 
    billing_cancellation_completed BOOLEAN DEFAULT false NOT NULL, 
    last_failure VARCHAR(64), 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (user_id), 
    CONSTRAINT ck_account_deletion_requests_last_failure CHECK (last_failure IS NULL OR last_failure IN ('billing_unavailable', 'billing_cancellation_failed', 'media_cleanup_failed', 'database_deletion_failed'))
);

