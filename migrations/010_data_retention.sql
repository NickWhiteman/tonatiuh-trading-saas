ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','DELETION_PENDING','DELETED'));
ALTER TABLE users ADD COLUMN terms_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE users ADD COLUMN privacy_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE users ADD COLUMN consented_at timestamptz;
ALTER TABLE users ADD COLUMN deletion_requested_at timestamptz;
ALTER TABLE users ADD COLUMN scheduled_deletion_at timestamptz;
ALTER TABLE users ADD COLUMN anonymized_at timestamptz;
CREATE INDEX users_scheduled_deletion_idx ON users(scheduled_deletion_at) WHERE status='DELETION_PENDING';

CREATE TABLE data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject_hash text NOT NULL, kind text NOT NULL CHECK(kind IN ('EXPORT','DELETE','CANCEL_DELETE')),
  status text NOT NULL CHECK(status IN ('REQUESTED','COMPLETED','REJECTED')), requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX data_subject_requests_subject_idx ON data_subject_requests(subject_hash,requested_at DESC);
