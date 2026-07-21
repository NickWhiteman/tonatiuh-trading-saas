CREATE OR REPLACE FUNCTION app_private.can_access_user(target uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT current_setting('app.platform_admin',true)='true'
    OR current_setting('app.service_access',true)='true'
    OR current_setting('app.worker_access',true)='true'
    OR (target IS NOT NULL AND target=NULLIF(current_setting('app.current_user_id',true),'')::uuid)
$$;
REVOKE ALL ON FUNCTION app_private.can_access_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_user(uuid) TO tonatiuh_api,tonatiuh_worker;

CREATE TABLE consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_hash text NOT NULL CHECK(length(subject_hash)=64),
  document_type text NOT NULL CHECK(document_type IN ('TERMS','PRIVACY')),
  document_version text NOT NULL CHECK(length(document_version) BETWEEN 1 AND 100),
  document_url text NOT NULL CHECK(length(document_url) BETWEEN 1 AND 1000),
  document_sha256 text NOT NULL CHECK(document_sha256~'^[0-9a-f]{64}$'),
  source text NOT NULL CHECK(source IN ('REGISTRATION','RECONSENT','MIGRATED_LEGACY')),
  request_id text,
  ip_hash text CHECK(ip_hash IS NULL OR length(ip_hash)=64),
  user_agent_hash text CHECK(user_agent_hash IS NULL OR length(user_agent_hash)=64),
  evidence_key_id text NOT NULL DEFAULT 'legacy' CHECK(length(evidence_key_id) BETWEEN 1 AND 100),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,document_type,document_version)
);
CREATE INDEX consent_events_subject_idx ON consent_events(subject_hash,accepted_at DESC);
CREATE INDEX consent_events_user_idx ON consent_events(user_id,accepted_at DESC);
INSERT INTO consent_events(user_id,subject_hash,document_type,document_version,document_url,document_sha256,source,evidence_key_id,accepted_at)
SELECT id,repeat('0',64),'TERMS',terms_version,'legacy:unavailable',repeat('0',64),'MIGRATED_LEGACY','legacy',consented_at FROM users WHERE consented_at IS NOT NULL
UNION ALL
SELECT id,repeat('0',64),'PRIVACY',privacy_version,'legacy:unavailable',repeat('0',64),'MIGRATED_LEGACY','legacy',consented_at FROM users WHERE consented_at IS NOT NULL;
UPDATE users SET terms_version='legacy',privacy_version='legacy',updated_at=now() WHERE consented_at IS NOT NULL;
ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events FORCE ROW LEVEL SECURITY;
CREATE POLICY subject_isolation ON consent_events USING(app_private.can_access_user(user_id)) WITH CHECK(app_private.can_access_user(user_id));
REVOKE ALL ON consent_events FROM tonatiuh_api,tonatiuh_worker;
GRANT SELECT,INSERT ON consent_events TO tonatiuh_api;
GRANT SELECT,INSERT,DELETE ON consent_events TO tonatiuh_worker;

CREATE OR REPLACE FUNCTION app_private.protect_consent_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND (current_setting('app.service_access',true)='true' OR current_setting('app.worker_access',true)='true') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'consent evidence is immutable' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION app_private.protect_consent_evidence() FROM PUBLIC;
CREATE TRIGGER consent_events_immutable BEFORE UPDATE OR DELETE ON consent_events FOR EACH ROW EXECUTE FUNCTION app_private.protect_consent_evidence();

ALTER TABLE data_subject_requests DROP CONSTRAINT data_subject_requests_kind_check;
ALTER TABLE data_subject_requests ADD CONSTRAINT data_subject_requests_kind_check CHECK(kind IN ('EXPORT','DELETE','CANCEL_DELETE','ACCESS','RECTIFY','RESTRICT','OBJECT'));
ALTER TABLE data_subject_requests DROP CONSTRAINT data_subject_requests_status_check;
ALTER TABLE data_subject_requests ADD CONSTRAINT data_subject_requests_status_check CHECK(status IN ('REQUESTED','IN_PROGRESS','COMPLETED','REJECTED'));
ALTER TABLE data_subject_requests
  ADD COLUMN due_at timestamptz NOT NULL DEFAULT (now()+interval '30 days'),
  ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN rejection_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX data_subject_requests_due_idx ON data_subject_requests(due_at) WHERE status IN ('REQUESTED','IN_PROGRESS');
ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY subject_isolation ON data_subject_requests USING(app_private.can_access_user(user_id)) WITH CHECK(app_private.can_access_user(user_id));
REVOKE ALL ON data_subject_requests FROM tonatiuh_api,tonatiuh_worker;
GRANT SELECT,INSERT,UPDATE ON data_subject_requests TO tonatiuh_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON data_subject_requests TO tonatiuh_worker;
