-- revision: 20261125_feedback_images
-- parent: 20261125_user_activity
-- Screenshots attached to a problem report or idea (storage keys in the
-- owner's uploads/ prefix, at most three per message).
ALTER TABLE user_feedback
    ADD COLUMN image_keys TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(image_keys) <= 3);
