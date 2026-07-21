# Quota denials

`TonatiuhQuotaDenialsSpike` means more than 20 quota or entitlement checks were
rejected in 15 minutes and the condition persisted for 10 minutes.

1. Group `tonatiuh_quota_denials_total` by `resource` and `plan`; identify whether
   the spike affects one feature or all plan enforcement.
2. Correlate the interval with billing webhook errors, expired subscriptions and
   deployments. Confirm the effective subscription in PostgreSQL without
   changing it manually.
3. For a single tenant, compare `GET /api/v1/billing/usage` with the plan catalog and
   inspect recent audit events. Do not expose credential ciphertext or payment
   provider payloads in support tickets.
4. If valid payments were not activated, follow `docs/incidents/billing.md` and
   replay only verified, idempotent provider events. Do not bypass quotas.
5. If enforcement is correct, notify support/product: sustained denials can be a
   legitimate upgrade signal or a client retry loop. Rate-limit a faulty client
   before changing product limits.
6. Resolve the alert after the denial rate normalizes and record the affected
   resource, plan, tenant count and root cause.
