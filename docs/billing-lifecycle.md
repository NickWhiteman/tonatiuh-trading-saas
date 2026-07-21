# Billing lifecycle

PRO renewals use saved YooKassa payment methods and a new idempotency key for
each deliberate charge attempt. Ambiguous network failures reuse the same
attempt key. Provider objects in non-final states are polled by the billing
worker in addition to verified webhooks.

The default dunning policy retries after 1, 24, 72 and 120 hours within a
seven-day grace period. During `PAST_DUE`, PRO remains available until
`grace_period_end`. A successful retry clears dunning state. Exhausted retries,
an expired grace period, or `permission_revoked` moves the subscription to
`CANCELLED`, disables renewal and downgrades entitlements to FREE.

Configure the policy with `BILLING_GRACE_PERIOD_DAYS`,
`BILLING_RETRY_SCHEDULE_HOURS` and `BILLING_RECONCILIATION_MINUTES`. Retry hours
must be strictly increasing and fit inside the grace period.

Platform administrators can request an idempotent full refund using
`POST /api/v1/admin/payments/{id}/refund` and inspect results through
`GET /api/v1/admin/refunds`. A successful full refund of the subscription's
latest payment immediately disables PRO. Refunding an older payment preserves a
newer paid period. Partial refunds are intentionally unsupported until product,
receipt and entitlement allocation rules are defined.

Payment periods, cancellation failures and refund effects each have independent
database application markers. Webhook delivery, API responses and reconciliation
may therefore arrive in any order without extending or revoking a subscription
twice.
