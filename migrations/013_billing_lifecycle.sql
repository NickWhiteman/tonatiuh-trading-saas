ALTER TABLE subscriptions
  ADD COLUMN grace_period_end timestamptz,
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count>=0),
  ADD COLUMN last_billing_attempt_at timestamptz,
  ADD COLUMN last_billing_error_code text;

ALTER TABLE billing_payments
  ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK(attempt_number>0),
  ADD COLUMN reconcile_after timestamptz,
  ADD COLUMN reconciliation_attempts integer NOT NULL DEFAULT 0 CHECK(reconciliation_attempts>=0),
  ADD COLUMN last_reconciled_at timestamptz,
  ADD COLUMN entitlement_applied_at timestamptz,
  ADD COLUMN failure_applied_at timestamptz;

CREATE TABLE billing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_refund_id text UNIQUE,
  provider_payment_id text NOT NULL REFERENCES billing_payments(provider_payment_id),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK(status IN ('requested','pending','succeeded','canceled')),
  amount_kopecks integer NOT NULL CHECK(amount_kopecks>0),
  currency text NOT NULL CHECK(currency='RUB'),
  reason text NOT NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_applied_at timestamptz,
  reconcile_after timestamptz,
  reconciliation_attempts integer NOT NULL DEFAULT 0 CHECK(reconciliation_attempts>=0),
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX billing_payments_reconcile_idx ON billing_payments(reconcile_after) WHERE reconcile_after IS NOT NULL;
CREATE INDEX billing_refunds_payment_idx ON billing_refunds(provider_payment_id,created_at DESC);
CREATE INDEX billing_refunds_reconcile_idx ON billing_refunds(reconcile_after) WHERE reconcile_after IS NOT NULL;
ALTER TABLE billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_refunds USING(app_private.can_access_organization(organization_id)) WITH CHECK(app_private.can_access_organization(organization_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON billing_refunds TO tonatiuh_api,tonatiuh_worker;
