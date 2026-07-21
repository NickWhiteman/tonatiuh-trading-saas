ALTER TABLE refresh_tokens ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE refresh_tokens rt SET organization_id=(SELECT organization_id FROM organization_memberships m WHERE m.user_id=rt.user_id ORDER BY m.created_at LIMIT 1);
DELETE FROM refresh_tokens WHERE organization_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX refresh_tokens_org_idx ON refresh_tokens(organization_id);

CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email citext NOT NULL, role text NOT NULL CHECK(role IN ('ADMIN','TRADER','ANALYST','BILLING','VIEWER')),
  token_hash text NOT NULL UNIQUE, invited_by uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
  accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,email)
);
CREATE INDEX organization_invitations_active_idx ON organization_invitations(organization_id,expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;
