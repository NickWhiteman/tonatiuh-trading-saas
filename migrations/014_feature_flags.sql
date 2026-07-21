CREATE TABLE feature_flags (
  key text PRIMARY KEY CHECK(key~'^[a-z][a-z0-9_]{2,63}$'),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 500),
  enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK(rollout_percentage BETWEEN 0 AND 100),
  client_visible boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_flag_overrides (
  flag_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(flag_key,organization_id)
);

CREATE INDEX feature_flag_overrides_organization_idx ON feature_flag_overrides(organization_id);
ALTER TABLE feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feature_flag_overrides
  USING(app_private.can_access_organization(organization_id))
  WITH CHECK(app_private.can_access_organization(organization_id));

GRANT SELECT,UPDATE ON feature_flags TO tonatiuh_api;
GRANT SELECT ON feature_flags TO tonatiuh_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON feature_flag_overrides TO tonatiuh_api;
GRANT SELECT ON feature_flag_overrides TO tonatiuh_worker;

INSERT INTO feature_flags(key,description,enabled,rollout_percentage,client_visible)
VALUES('billing_checkout','Allows organizations to create YooKassa checkout sessions.',true,100,true);
