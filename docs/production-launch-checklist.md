# Production launch checklist

The launch owner records every decision in the approved change ticket. A failed
automated check is a **no-go**; it must not be waived by editing the gate or by
deploying a mutable tag.

## Before the window

1. Protect the GitHub `production` Environment with required reviewers and
   restrict deployment branches to signed release tags. Configure its non-secret
   variables used by `production-readiness.yml`.
2. Publish application and PostgreSQL tools images with SBOM, provenance and
   keyless signatures. Record their digests; set `IMAGE_REFERENCE` and
   `POSTGRES_TOOLS_REFERENCE` to `repository@sha256:...` values.
3. Have different people review migrations and security-impacting changes.
   Confirm CI, dependency audit, integration/load tests and API compatibility.
4. Confirm an isolated restore drill no more than eight days old, healthy PITR,
   migration capacity and a verified encrypted pre-release backup.
5. Verify legal-document digests, payment/email production modes, DNS/TLS,
   alert routing and the named on-call engineer.
6. Record the previous healthy application digest as the rollback target.

Copy `.env.release.example` to `.env.release`, fill its non-secret evidence and
run `npm run release:check`; the command loads it together with `.env.production`.
Never put runtime secrets in either file.

## Rollout and acceptance

1. Pull digest-pinned images, run the one-shot migration, then start the API and
   workers. Compose waits for `/health/ready` before exposing the proxy.
2. Run `SMOKE_BASE_URL=https://api.your-domain npm run release:smoke`. Probes are
   read-only: liveness, database-backed readiness and current legal documents.
3. Observe at least 30 minutes: availability, p95 latency, 5xx rate, queue depth,
   worker heartbeat, database saturation, billing callbacks and email delivery.
4. Complete the ticket only when smoke tests and SLO signals are healthy. Record
   the deployed digest, migration version, timestamps and dashboards.

## Stop and rollback criteria

Stop for failed readiness, migration error, error-budget burn, stale workers,
growing queues, payment failures or possible cross-tenant/security impact.
Disable affected feature flags when that contains the fault. Otherwise recreate
application services from the previous digest. Never restore the database merely
to undo a release; use disaster recovery only for data loss or corruption.
