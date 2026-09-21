-- revision: 20260903_0002
-- parent: 20260903_0001
ALTER TABLE users ADD COLUMN stripe_subscription_status VARCHAR(50);

ALTER TABLE users ADD COLUMN stripe_current_period_end TIMESTAMP WITH TIME ZONE;

ALTER TABLE users ADD COLUMN stripe_cancel_at_period_end BOOLEAN DEFAULT false NOT NULL;

CREATE UNIQUE INDEX uq_users_stripe_customer_id ON users (stripe_customer_id);

CREATE UNIQUE INDEX uq_users_stripe_subscription_id ON users (stripe_subscription_id);

CREATE TABLE stripe_events (
    id VARCHAR(255) NOT NULL, 
    type VARCHAR(100) NOT NULL, 
    credit_grant_id VARCHAR(255), 
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_stripe_events_credit_grant_id ON stripe_events (credit_grant_id);

