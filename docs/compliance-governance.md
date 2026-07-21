# Compliance governance

This is an engineering control framework, not legal advice. The operating
company must have qualified counsel determine applicable law, lawful bases,
contract language, regulator notifications and jurisdiction-specific deadlines.

## Legal document release

1. Counsel approves immutable Terms and Privacy documents and their effective
   date. Publish each version at a permanent HTTPS URL; never replace content at
   an existing URL.
2. Calculate SHA-256 over the exact served bytes. Set `TERMS_VERSION`,
   `PRIVACY_VERSION`, their URLs and digests in release configuration. Keep old
   documents reachable.
3. Deploy configuration before requiring re-consent. Clients obtain versions
   from `GET /api/v1/compliance/documents` and submit those exact versions. A
   version race returns `409` with the current documents.
4. The API stores append-only evidence: document type/version/URL/hash,
   timestamp, source and HMAC-pseudonymized subject, IP and user agent. Raw IPs
   and user agents are not stored in the evidence table.
5. Users with stale versions can authenticate, inspect/export/delete their data,
   stop bots and cancel subscriptions. New trading risk and payment commitments
   return `428 LEGAL_CONSENT_REQUIRED` until re-consent.

Migration `015_compliance_governance.sql` marks pre-existing consent snapshots as
`MIGRATED_LEGACY`, because the old schema did not retain a document URL/hash, and
forces current re-consent before new risky actions. Deploy a compatible frontend
before or together with this migration.

The evidence HMAC key is separate from JWT and encryption keys in production.
Rotate it only with a documented evidence-verification and retention plan.

## Data-subject requests

Authenticated users can submit access, rectification, restriction and objection
requests and see their status. Export and account deletion remain automated.
Manual requests receive a 30-day engineering deadline; legal may set a shorter
applicable deadline. Administrators triage them through
`/api/v1/admin/data-subject-requests`; terminal decisions are audited and
rejections require a reason.

Do not put identity documents, credentials, exchange secrets or unnecessary
special-category data in free-text details. Perform elevated identity checks out
of band when required.

## Control cadence

- Quarterly: review platform admins, database roles, secrets and support tools.
- Quarterly: verify the data inventory, subprocessors, transfers, retention jobs
  and deletion samples.
- Annually and after material change: threat model, privacy impact assessment,
  incident tabletop, recovery exercise and policy review.
- Before a new data purpose: document purpose, fields, lawful basis, recipients,
  retention, notice and deletion path before implementation.

Marketing consent is not implied by Terms or Privacy. Marketing is disabled; add
a separate optional, withdrawable purpose before introducing it.
