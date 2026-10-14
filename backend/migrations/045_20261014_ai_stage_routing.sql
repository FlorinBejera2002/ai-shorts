-- revision: 20261014_ai_stage_routing
-- parent: 20261013_agent_source_resources
CREATE TABLE ai_routing_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    routes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(routes) = 'object'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO ai_routing_settings(singleton) VALUES (true);
