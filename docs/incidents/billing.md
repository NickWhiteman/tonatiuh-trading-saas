# Billing degradation

1. Compare local payment status with YooKassa using provider payment IDs from the secured admin API.
2. Verify webhook reachability, credentials, signature/status verification and provider status page.
3. Do not manually mark payments successful. Replay verified webhooks; database idempotency prevents duplicate periods.
4. Pause renewal processing if failures are systemic, preserving the original idempotency keys.
5. Reconcile payments and subscriptions after recovery and escalate customer-impacting discrepancies.
6. Check `tonatiuh_billing_reconciliation_overdue`, pending payments and refunds. Never create a second provider operation while the original idempotency key has an unknown result.
7. For `PAST_DUE`, confirm `retry_count`, `next_billing_at`, `grace_period_end` and `last_billing_error_code`. Do not extend grace manually.
8. For refunds, compare the provider refund with `billing_refunds`. A full refund of `subscriptions.last_payment_id` must leave the subscription `CANCELLED` and FREE.
