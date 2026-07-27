CREATE TABLE bot_runtime_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bot_runtime_logs_bot_created_idx
  ON bot_runtime_logs(bot_id, created_at DESC, id DESC);

ALTER TABLE bot_runtime_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_runtime_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bot_runtime_logs
  USING (app_private.can_access_organization(organization_id))
  WITH CHECK (app_private.can_access_organization(organization_id));

GRANT SELECT ON bot_runtime_logs TO tonatiuh_api;
GRANT SELECT, INSERT, DELETE ON bot_runtime_logs TO tonatiuh_worker;
GRANT USAGE, SELECT ON SEQUENCE bot_runtime_logs_id_seq TO tonatiuh_worker;
