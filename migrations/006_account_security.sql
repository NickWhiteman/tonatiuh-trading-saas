CREATE TABLE account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('VERIFY_EMAIL','RESET_PASSWORD')), token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_active_idx ON account_tokens(user_id,kind,expires_at) WHERE consumed_at IS NULL;

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient citext NOT NULL, template text NOT NULL,
  encrypted_payload text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(next_attempt_at) WHERE status IN ('PENDING','FAILED');

CREATE TABLE request_rate_limits (
  key_hash text NOT NULL, bucket_start timestamptz NOT NULL, request_count integer NOT NULL,
  expires_at timestamptz NOT NULL, PRIMARY KEY(key_hash,bucket_start)
);
CREATE INDEX request_rate_limits_expiry_idx ON request_rate_limits(expires_at);
