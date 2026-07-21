CREATE TABLE organization_usage_monthly (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL, metric text NOT NULL CHECK(metric IN ('BOT_COMMANDS')),
  quantity bigint NOT NULL DEFAULT 0 CHECK(quantity>=0), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,period_start,metric)
);
ALTER TABLE organization_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_usage_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization_usage_monthly
  USING(app_private.can_access_organization(organization_id)) WITH CHECK(app_private.can_access_organization(organization_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON organization_usage_monthly TO tonatiuh_api,tonatiuh_worker;
