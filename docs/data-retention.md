# Data retention and account deletion

This document is an engineering policy and must be reviewed against the laws,
contracts and accounting rules applicable to the operating company.

| Data | Default lifecycle |
| --- | --- |
| Active account profile and consent versions | while the account is active |
| Account deletion recovery window | 30 days |
| Expired account tokens | 7 days; consumed tokens 30 days |
| Revoked or expired refresh sessions | 30 days |
| Sent email outbox payloads | 30 days; failed messages 90 days |
| Rate-limit buckets | until their configured expiry |
| Full payment provider snapshots | 90 days, then minimized |
| Audit IP address and metadata | 400 days, then stripped |
| Data-subject request evidence | 6 years, pseudonymous subject hash |

`GET /api/auth/me/export` returns profile, consent, memberships and user audit
actions. It intentionally excludes credential ciphertext, password/token hashes,
payment methods, provider payloads and other workspace members' personal data.

`DELETE /api/auth/me` requires the current password. It rejects deletion while
the user owns a workspace with other members, revokes all refresh sessions and
schedules anonymization after 30 days. During the window the account cannot use
authenticated endpoints. `POST /api/auth/cancel-deletion` requires email and
password and restores access.

After the deadline the retention worker removes PII, credentials, trading
runtime data and payment methods. Minimal financial payment facts remain for
legal reconciliation, with provider snapshots removed. Backups expire through
the independently configured backup retention schedule; deleted data must not be
selectively restored into production.

Run one retention worker leader continuously and alert on its last successful
cycle. Changes to these periods require legal/security review, a migration plan,
and updates to customer-facing privacy terms.
