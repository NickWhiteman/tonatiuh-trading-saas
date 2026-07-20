CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'TRADER', 'ANALYST', 'BILLING', 'VIEWER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exchange_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  exchange_code text NOT NULL,
  label text NOT NULL,
  credentials_ciphertext text NOT NULL,
  encryption_key_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, label)
);

CREATE TABLE trading_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  exchange_connection_id uuid NOT NULL REFERENCES exchange_connections(id),
  name text NOT NULL,
  strategy text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  desired_state text NOT NULL DEFAULT 'STOPPED' CHECK (desired_state IN ('RUNNING', 'STOPPED')),
  actual_state text NOT NULL DEFAULT 'STOPPED' CHECK (actual_state IN ('STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
  command text NOT NULL CHECK (command IN ('START', 'STOP', 'RESTART')),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  requested_by uuid REFERENCES users(id),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE trading_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES trading_bots(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES trading_bots(id),
  session_id uuid REFERENCES trading_sessions(id),
  exchange_order_id text,
  client_order_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL,
  status text NOT NULL,
  quantity numeric(36, 18) NOT NULL CHECK (quantity > 0),
  price numeric(36, 18),
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_order_id)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  request_id text,
  ip_address inet,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_memberships_user_idx ON organization_memberships(user_id);
CREATE INDEX exchange_connections_org_idx ON exchange_connections(organization_id);
CREATE INDEX trading_bots_org_state_idx ON trading_bots(organization_id, actual_state);
CREATE INDEX bot_commands_pending_idx ON bot_commands(status, created_at) WHERE status = 'PENDING';
CREATE INDEX trading_sessions_org_started_idx ON trading_sessions(organization_id, started_at DESC);
CREATE INDEX orders_org_created_idx ON orders(organization_id, created_at DESC);
CREATE INDEX audit_events_org_created_idx ON audit_events(organization_id, created_at DESC);
