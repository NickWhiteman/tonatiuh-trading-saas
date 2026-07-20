CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'YOOKASSA' CHECK (provider='YOOKASSA'),
  plan text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','PRO')),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('INACTIVE','ACTIVE','PAST_DUE','CANCELLED')),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  payment_method_id text,
  auto_renew boolean NOT NULL DEFAULT false,
  next_billing_at timestamptz,
  last_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_payment_id text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('INITIAL','RENEWAL')),
  status text NOT NULL CHECK (status IN ('pending','waiting_for_capture','succeeded','canceled')),
  amount_kopecks integer NOT NULL CHECK (amount_kopecks > 0),
  currency text NOT NULL CHECK (currency='RUB'),
  provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE billing_events (
  provider_event_id text PRIMARY KEY,
  provider_payment_id text NOT NULL,
  event_type text NOT NULL,
  provider_snapshot jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_renewal_idx ON subscriptions(next_billing_at) WHERE auto_renew=true;
CREATE INDEX billing_payments_org_created_idx ON billing_payments(organization_id,created_at DESC);
