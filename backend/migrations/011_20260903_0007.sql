-- revision: 20260903_0007
-- parent: 20260903_0006
ALTER TABLE account_deletion_requests ADD COLUMN stripe_customer_id VARCHAR(255);

ALTER TABLE users ADD COLUMN stripe_checkout_generation INTEGER DEFAULT '0' NOT NULL;

ALTER TABLE users ADD COLUMN stripe_state_generation INTEGER DEFAULT '0' NOT NULL;

CREATE TABLE billing_checkout_claims (
    user_id UUID NOT NULL, 
    token VARCHAR(64) NOT NULL, 
    plan_id VARCHAR(32) NOT NULL, 
    price_id VARCHAR(255) NOT NULL, 
    locale VARCHAR(8) NOT NULL, 
    customer_id VARCHAR(255), 
    customer_email VARCHAR(255) NOT NULL, 
    success_url VARCHAR(2048) NOT NULL, 
    cancel_url VARCHAR(2048) NOT NULL, 
    generation INTEGER NOT NULL, 
    session_id VARCHAR(255), 
    lease_expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    checkout_expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (user_id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_billing_checkout_claims_session_id UNIQUE (session_id)
);

