-- revision: 20261126_spanish_locale
-- parent: 20261125_feedback_images
-- Spanish (es) joins en and ro as a supported UI locale for account
-- preferences and the YouTube import OAuth round trip.
ALTER TABLE account_preferences DROP CONSTRAINT account_preferences_locale_check;
ALTER TABLE account_preferences ADD CONSTRAINT account_preferences_locale_check CHECK (locale IN ('en','ro','es'));
ALTER TABLE youtube_import_oauth_states DROP CONSTRAINT youtube_import_oauth_states_locale_check;
ALTER TABLE youtube_import_oauth_states ADD CONSTRAINT youtube_import_oauth_states_locale_check CHECK (locale IN ('en','ro','es'));
