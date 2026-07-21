DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tonatiuh_api') THEN
    CREATE ROLE tonatiuh_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tonatiuh_worker') THEN
    CREATE ROLE tonatiuh_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tonatiuh_migrator') THEN
    CREATE ROLE tonatiuh_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END $$;

DO $$ BEGIN
  EXECUTE format('GRANT tonatiuh_api,tonatiuh_worker,tonatiuh_migrator TO %I',current_user);
END $$;

GRANT USAGE ON SCHEMA public TO tonatiuh_api,tonatiuh_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tonatiuh_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tonatiuh_worker;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tonatiuh_api,tonatiuh_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO tonatiuh_api,tonatiuh_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO tonatiuh_api,tonatiuh_worker;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO tonatiuh_api,tonatiuh_worker;
CREATE OR REPLACE FUNCTION app_private.can_access_organization(target uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT target IS NOT NULL AND (
    target=NULLIF(current_setting('app.current_organization_id',true),'')::uuid
    OR current_setting('app.platform_admin',true)='true'
    OR current_setting('app.service_access',true)='true'
    OR current_setting('app.worker_access',true)='true'
  )
$$;
REVOKE ALL ON FUNCTION app_private.can_access_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_organization(uuid) TO tonatiuh_api,tonatiuh_worker;

DO $$
DECLARE protected_table text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY['exchange_connections','trading_bots','bot_commands','trading_sessions','orders','subscriptions','billing_payments','audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',protected_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',protected_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',protected_table);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_private.can_access_organization(organization_id)) WITH CHECK (app_private.can_access_organization(organization_id))',protected_table);
  END LOOP;
END $$;
