-- revision: 20261125_user_activity
-- parent: 20261124_user_feedback
-- Activity shown to admins in the user drawer. Most of the history is read from
-- the tables that already record it (sign-ins, jobs, imports, posts, feedback);
-- this migration adds only what nothing else keeps:
--   * users.last_active_at survives sign-out, unlike sessions.last_seen_at;
--   * user_activity_events records plan, profile, preference and brand kit
--     changes. Rows hold a short machine label only, never content.
ALTER TABLE users ADD COLUMN last_active_at TIMESTAMPTZ;
UPDATE users u SET last_active_at = a.at FROM (
    SELECT user_id, max(at) AS at FROM (
        SELECT user_id, last_seen_at AS at FROM sessions
        UNION ALL SELECT user_id, created_at FROM account_security_events
    ) seen GROUP BY user_id
) a WHERE a.user_id = u.id;

CREATE TABLE user_activity_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('plan_changed','profile_updated','preferences_updated','brand_kit_saved')),
    detail TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_activity_events_user ON user_activity_events(user_id, created_at DESC);

-- Repeated saves (autosave, sliders) collapse into one row per kind every
-- ten minutes so the timeline stays readable.
CREATE FUNCTION record_user_activity(target UUID, activity TEXT, info TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF activity <> 'plan_changed' AND EXISTS (
        SELECT 1 FROM user_activity_events
        WHERE user_id = target AND kind = activity AND created_at > now() - interval '10 minutes'
    ) THEN
        RETURN;
    END IF;
    INSERT INTO user_activity_events(user_id, kind, detail) VALUES (target, activity, left(coalesce(info, ''), 80));
END $$;

-- Triggers catch every write path (settings page, workspace agent, Stripe
-- webhook, account deletion) without each caller remembering to log.
CREATE FUNCTION user_activity_from_users() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN
        PERFORM record_user_activity(NEW.id, 'plan_changed', OLD.plan || ' → ' || NEW.plan);
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        PERFORM record_user_activity(NEW.id, 'profile_updated', '');
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER users_activity AFTER UPDATE OF plan, name ON users
    FOR EACH ROW EXECUTE FUNCTION user_activity_from_users();

CREATE FUNCTION user_activity_from_preferences() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM record_user_activity(NEW.user_id, 'preferences_updated', '');
    RETURN NULL;
END $$;
CREATE TRIGGER account_preferences_activity AFTER INSERT OR UPDATE ON account_preferences
    FOR EACH ROW EXECUTE FUNCTION user_activity_from_preferences();

CREATE FUNCTION user_activity_from_brand_kits() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM record_user_activity(NEW.user_id, 'brand_kit_saved', '');
    RETURN NULL;
END $$;
CREATE TRIGGER brand_kits_activity AFTER INSERT OR UPDATE ON brand_kits
    FOR EACH ROW EXECUTE FUNCTION user_activity_from_brand_kits();
