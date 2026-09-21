-- revision: 20260911_0006
-- parent: 20260911_0005
CREATE TABLE credit_grant_batches (
    batch_key VARCHAR(128) NOT NULL, 
    amount INTEGER NOT NULL, 
    cutoff TIMESTAMP WITH TIME ZONE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (batch_key), 
    CONSTRAINT ck_credit_grant_batches_positive_amount CHECK (amount > 0)
);

CREATE TABLE credit_grant_recipients (
    batch_key VARCHAR(128) NOT NULL, 
    user_id UUID NOT NULL, 
    balance_before INTEGER NOT NULL, 
    balance_after INTEGER NOT NULL, 
    PRIMARY KEY (batch_key, user_id), 
    CONSTRAINT ck_credit_grant_recipients_positive_delta CHECK (balance_after > balance_before), 
    FOREIGN KEY(batch_key) REFERENCES credit_grant_batches (batch_key)
);

