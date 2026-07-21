# Production deployment

## Initial database provisioning

1. Create a dedicated migration login with schema ownership and `CREATEROLE`.
   Do not expose this credential to runtime containers.
2. Run the `migrate` one-shot service with `migration_database_url`.
3. As a database administrator, create distinct API and worker login roles:

   ```bash
   psql "$ADMIN_DATABASE_URL" \
     -v api_login=tonatiuh_api_login -v api_password="$API_DB_PASSWORD" \
     -v worker_login=tonatiuh_worker_login -v worker_password="$WORKER_DB_PASSWORD" \
     -f ops/postgres/runtime-roles.sql
   ```

4. Store connection URLs for those logins as `api_database_url` and
   `worker_database_url`. Verify both logins are neither superusers nor table
   owners and do not have `BYPASSRLS`.

Use a managed PostgreSQL service with encrypted connections, point-in-time
recovery, multi-zone failover, deletion protection, and private networking.

## Secrets and TLS

Create all external secrets declared in `compose.production.yaml`. Values must
not be placed in `.env.production`; it contains only non-secret configuration.
The application accepts `NAME_FILE=/run/secrets/name` for every configuration
value. Caddy terminates TLS automatically and is the only publicly exposed
service. Restrict ports 80/443 at the host firewall and keep PostgreSQL private.

## Release procedure

1. Build, scan, sign, and publish an immutable image tag or digest in CI.
2. Take and verify a database backup. Perform restore drills regularly.
3. Review migrations. Schema changes must be backward-compatible expand steps;
   destructive contract steps happen only after old application versions are
   gone and backups have passed retention.
4. Set `IMAGE_TAG` to the immutable candidate and run:

   ```bash
   docker compose --env-file .env.production -f compose.production.yaml pull
   docker compose --env-file .env.production -f compose.production.yaml run --rm migrate
   docker compose --env-file .env.production -f compose.production.yaml up -d api trading-worker billing-worker email-worker proxy
   curl --fail --silent "https://$DOMAIN/health/ready"
   ```

5. Verify error rate, latency, worker heartbeat, queue depth, payment callbacks,
   and email delivery before completing the rollout.

Start the internal monitoring stack by merging the observability file:

```bash
docker compose --env-file .env.production -f compose.production.yaml -f compose.observability.yaml up -d prometheus alertmanager grafana
```

Grafana binds only to `127.0.0.1:3000`; access it through an SSH tunnel or a
separately authenticated private ingress. Configure `alert_webhook_url` and
`grafana_admin_password` as external secrets. Objectives and escalation
procedures are documented in `docs/slo.md` and `docs/incidents/`.

## Rollback

Set `IMAGE_TAG` back to the previous immutable version and recreate runtime
services. Do not reverse a migration during an application rollback; forward-fix
the schema. Database restore is a disaster-recovery action and requires an
incident decision, maintenance mode, confirmed recovery point, and a subsequent
integrity audit.

## Backup and restore

Run `ops/postgres/backup.sh` from a trusted PostgreSQL 17 tools container using a
read-only/backup-capable credential and durable encrypted storage. It creates a
custom-format dump, validates its catalog, and writes a SHA-256 file. Test
`ops/postgres/restore.sh` against an isolated database; never run restore against
production as a routine rollback mechanism.
