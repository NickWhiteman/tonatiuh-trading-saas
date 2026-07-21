# Billing degradation

1. Compare local payment status with YooKassa using provider payment IDs from the secured admin API.
2. Verify webhook reachability, credentials, signature/status verification and provider status page.
3. Do not manually mark payments successful. Replay verified webhooks; database idempotency prevents duplicate periods.
4. Pause renewal processing if failures are systemic, preserving the original idempotency keys.
5. Reconcile payments and subscriptions after recovery and escalate customer-impacting discrepancies.
