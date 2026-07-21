# Transactional email degradation

1. Check queue age, `DEAD_LETTER` count, SMTP connectivity and provider status.
2. Separate transient provider failures from template/configuration errors.
3. Confirm SPF, DKIM, DMARC and sending-domain reputation before increasing retries.
4. Never retry hard-bounced or complained recipients; suppression is intentional.
5. After remediation, requeue a small bounded sample through Platform Admin and monitor delivery events before processing the rest.
