-- revision: 20260906_0002
-- parent: 20260906_0001
ALTER TABLE users ADD COLUMN email_activation_required BOOLEAN DEFAULT false NOT NULL;

