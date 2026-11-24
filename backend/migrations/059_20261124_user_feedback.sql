-- revision: 20261124_user_feedback
-- parent: 20261124_platform_errors
-- Feedback sent from the web app: problem reports and ideas from the Feedback
-- page, and the one-tap rating shown after a clip job finishes. A clip rating
-- is kept once per job (a second answer updates it). Admins triage every row
-- in the admin console.
CREATE TABLE user_feedback (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('problem','idea','clip')),
    category TEXT NOT NULL DEFAULT '' CHECK (category IN ('','clips','publishing','billing','account','other')),
    rating SMALLINT CHECK (rating BETWEEN 1 AND 3),
    message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 4000),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    page TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((kind = 'clip') = (rating IS NOT NULL)),
    CHECK (kind = 'clip' OR char_length(btrim(message)) > 0)
);
CREATE UNIQUE INDEX user_feedback_clip_job ON user_feedback(user_id, job_id) WHERE kind = 'clip';
CREATE INDEX user_feedback_created ON user_feedback(created_at DESC, id DESC);
CREATE INDEX user_feedback_user ON user_feedback(user_id, created_at DESC);
