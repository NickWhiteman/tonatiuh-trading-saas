CREATE TABLE bot_sqlite_databases (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL,
  database_name text NOT NULL,
  relative_path text NOT NULL,
  is_delete smallint NOT NULL DEFAULT 0 CHECK (is_delete IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bot_id, database_name)
);

CREATE INDEX bot_sqlite_databases_org_deleted_idx
  ON bot_sqlite_databases(organization_id, is_delete);

ALTER TABLE bot_commands DROP CONSTRAINT bot_commands_command_check;
ALTER TABLE bot_commands
  ADD CONSTRAINT bot_commands_command_check
  CHECK (command IN ('START', 'STOP', 'RESTART', 'EMERGENCY_STOP', 'DELETE'));

GRANT SELECT,INSERT,UPDATE,DELETE ON bot_sqlite_databases TO tonatiuh_api,tonatiuh_worker;
GRANT USAGE,SELECT ON SEQUENCE bot_sqlite_databases_id_seq TO tonatiuh_api,tonatiuh_worker;

ALTER TABLE bot_sqlite_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sqlite_databases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bot_sqlite_databases
  USING (app_private.can_access_organization(organization_id))
  WITH CHECK (app_private.can_access_organization(organization_id));
