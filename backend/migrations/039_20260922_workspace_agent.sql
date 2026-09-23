-- revision: 20260922_workspace_agent
-- parent: 20260922_story_builder

CREATE TABLE workspace_agent_runs (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id text NOT NULL,
 request_hash text NOT NULL,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
 reply text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('planning','running','waiting_for_confirmation','waiting_for_resources','paused','cancel_requested','cancelled','completed','failed')),
 context jsonb NOT NULL,
 action jsonb,
 result jsonb,
 steps jsonb NOT NULL DEFAULT '[]',
 continue_plan boolean NOT NULL DEFAULT false,
 error text NOT NULL DEFAULT '',
 cost_credits integer NOT NULL DEFAULT 0 CHECK(cost_credits>=0),
 revision integer NOT NULL DEFAULT 1,
 planning_attempts integer NOT NULL DEFAULT 0,
 executing boolean NOT NULL DEFAULT false,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_agent_history ON workspace_agent_runs(user_id,created_at DESC,id DESC);
CREATE INDEX workspace_agent_pending ON workspace_agent_runs(next_check_at) WHERE status IN ('planning','running','cancel_requested');
CREATE TABLE workspace_agent_suggestions (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 context_key text NOT NULL,
 content jsonb NOT NULL,
 dismissed boolean NOT NULL DEFAULT false,
 run_id uuid REFERENCES workspace_agent_runs(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,context_key)
);
CREATE TABLE workspace_agent_events (
 run_id uuid NOT NULL REFERENCES workspace_agent_runs(id) ON DELETE CASCADE,
 sequence integer NOT NULL,
 status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,sequence)
);
