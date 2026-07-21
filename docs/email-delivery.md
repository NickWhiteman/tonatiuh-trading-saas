# Transactional email delivery

The email worker sends both text and escaped HTML in Russian or English. Tokens
appear only in HTTPS application links and are never logged. Configure SPF,
DKIM and DMARC for the `SMTP_FROM` domain, use a dedicated transactional stream,
and monitor provider reputation and rate limits.

Delivery attempts use exponential backoff capped at one hour. After eight failed
attempts a message becomes `DEAD_LETTER`; Platform Admin can inspect masked
recipients and explicitly requeue an item. Do not bulk retry before resolving
the provider or template failure.

The provider webhook accepts idempotent `DELIVERED`, `HARD_BOUNCE`, and `COMPLAINT`
events authenticated by `EMAIL_WEBHOOK_TOKEN`. Map the provider's signed event
format to this internal contract at the trusted ingress. Hard bounces and
complaints create an HMAC-based suppression entry. Suppressions must not be
removed merely to improve delivery statistics; verify recipient ownership and
the provider reason first.

Outbox delivery data is cleaned according to `docs/data-retention.md`. Provider
events are kept for 180 days; the suppression hash is retained while necessary
to prevent abusive repeat delivery. Alerts cover stalled queues and dead letters.
