ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_status_check;
UPDATE email_outbox SET status='DEAD_LETTER' WHERE status='FAILED';
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_status_check CHECK(status IN ('PENDING','PROCESSING','SENT','DELIVERED','BOUNCED','SUPPRESSED','DEAD_LETTER'));
ALTER TABLE email_outbox ADD COLUMN locale text NOT NULL DEFAULT 'ru' CHECK(locale IN ('ru','en'));
ALTER TABLE email_outbox ADD COLUMN provider_message_id text;
ALTER TABLE email_outbox ADD COLUMN last_attempt_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN delivered_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN bounced_at timestamptz;
CREATE UNIQUE INDEX email_outbox_provider_message_idx ON email_outbox(provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE email_suppressions (
  email_hash text PRIMARY KEY, reason text NOT NULL CHECK(reason IN ('HARD_BOUNCE','COMPLAINT')),
  provider_message_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_provider_events (
  event_id text PRIMARY KEY, outbox_id uuid REFERENCES email_outbox(id) ON DELETE SET NULL,
  provider_message_id text NOT NULL, event_type text NOT NULL CHECK(event_type IN ('DELIVERED','HARD_BOUNCE','COMPLAINT')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_provider_events_message_idx ON email_provider_events(provider_message_id,created_at DESC);
