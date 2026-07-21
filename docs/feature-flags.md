# Feature flags and gradual rollouts

Feature flags are server-side controls, not authorization checks. The protected
operation must still enforce authentication, tenant isolation, roles, quotas and
input validation after its flag is enabled.

`feature_flags.enabled=false` is the global kill switch and always wins. When it
is enabled, an organization override wins over the deterministic percentage
rollout. The SHA-256 assignment is stable for a `(flag, organization)` pair, so
users do not move between cohorts during normal deployments.

## Safe rollout

1. Deploy backward-compatible code with the flag disabled or at 0 percent.
2. Enable internal organizations with explicit overrides and verify logs, SLOs
   and business metrics.
3. Increase rollout in bounded steps such as 1, 5, 25, 50 and 100 percent. Hold
   each step for at least one representative traffic window.
4. Stop when error rate, latency or business guardrails regress. Set
   `enabled=false` for an immediate global kill switch; do not rely on a new
   deployment for emergency mitigation.
5. At 100 percent, remove temporary overrides. Delete flag code and schema data
   in a later backward-compatible release after the rollback window closes.

Platform administrators use `/api/v1/admin/feature-flags`. Every mutation
requires `expectedVersion` for optimistic locking and a non-empty
`changeReason`; changes and organization overrides are written to the audit log.
The user endpoint `/api/v1/features` exposes only `client_visible` decisions and
may help clients hide unavailable controls. The server remains authoritative.

The initial `billing_checkout` flag is enabled at 100 percent to preserve current
behaviour. Disabling it makes new checkout requests return `503 FEATURE_DISABLED`
with `Retry-After`, without affecting existing subscriptions or webhook handling.
