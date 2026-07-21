# Tonatiuh Trading SaaS

Trading backend used by Tonatiuh desktop and SaaS deployments.

Operational controls for deterministic staged releases and emergency kill
switches are documented in [docs/feature-flags.md](docs/feature-flags.md).
Backup, restore and regional recovery objectives are documented in
[docs/disaster-recovery.md](docs/disaster-recovery.md).
Consent evidence, data-subject workflows and review cadence are documented in
[docs/compliance-governance.md](docs/compliance-governance.md).

## Development

```bash
npm ci
npm test
npm run start:dev
```

Desktop mode stores SQLite databases under `TONATIUH_DATA_DIR`. Production
desktop launches also provide `TONATIUH_API_TOKEN` and `ENCRYPTION_KEY`.

## SaaS processes

Run database migrations before deploying a new release:

```bash
npm run build
npm run db:migrate
```

The API and trading supervisor are separate long-running processes:

```bash
node build/index.js
npm run worker:saas
```

Only one worker replica becomes leader. Standby replicas acquire the PostgreSQL
advisory lock after a leader failure and restore bots whose desired state is
`RUNNING`. Persist `SAAS_BOT_DATA_DIR`; each bot receives an isolated SQLite
runtime directory. Exchange credentials are decrypted only by the leader and
sent to the child over IPC, never through command-line arguments.

## Production observability

- Liveness: `GET /health/live`
- Readiness (including PostgreSQL): `GET /health/ready`
- Prometheus: `GET /metrics` with `Authorization: Bearer $METRICS_TOKEN`

Logs are emitted as JSON and include `requestId`, tenant identifiers, response
status, and duration. Start the complete local production topology with
`docker compose up --build`; migrations complete before API and workers start.

## API contract

The OpenAPI 3.1 contract is stored in `docs/openapi.yaml`. Validate it with
`npm run openapi:validate`; CI also verifies route inventory, authentication,
unique operation IDs, and required idempotency headers.

The canonical API prefix is `/api/v1`. The unversioned `/api` alias is deprecated
and remains available through 21 July 2027. Compatibility rules, migration
headers and the generated `@tonatiuh/trading-sdk` workflow are documented in
`docs/api-versioning.md`.

Bootstrap or revoke platform administration from a trusted shell after running
migrations: `npm run admin:set-role -- user@example.com ADMIN|USER`. Platform
admin privileges are independent from organization roles.

Plan limits and downgrade behavior are documented in
`docs/entitlements.md`. `GET /api/v1/billing/usage` returns the effective plan,
current limits and organization usage to OWNER and BILLING roles.
Renewal retries, grace periods, reconciliation and full-refund behavior are
documented in `docs/billing-lifecycle.md`.

## PostgreSQL isolation

Migration `009_postgres_rls.sql` provisions three NOLOGIN roles. Run migrations
with the database owner or a dedicated login that can create roles, then use
`DATABASE_ROLE=tonatiuh_api` for the HTTP process and
`DATABASE_ROLE=tonatiuh_worker` for background workers. The migration login must
not be shared with runtime containers in production.

Row Level Security is forced on exchange connections, bots, commands, sessions,
orders, subscriptions, payments, monthly usage, and audit events. API requests set the tenant
context inside each database transaction. Platform administration and trusted
webhook/worker operations use explicit, narrowly scoped contexts. Production
deployments should use separate login credentials for migration, API, and worker
processes; `DATABASE_ROLE` is defense in depth and is not a replacement for
separate credentials.

## Production launch

Production Compose accepts application and backup-tool images pinned by digest.
Run the fail-closed `npm run release:check` before rollout and the read-only
`npm run release:smoke` after it. Required evidence, go/no-go conditions and
rollback criteria are documented in `docs/production-launch-checklist.md`.
The isolated staging host and manual deployment workflow are documented in
`docs/staging-deployment.md`.
