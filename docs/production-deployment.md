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

1. Build, scan, sign, and publish an immutable image tag or digest in CI. For a
   legal-document release, verify immutable HTTPS URLs and SHA-256 values using
   the dual-review procedure in `docs/compliance-governance.md`; never deploy
   placeholder digests.
2. Confirm managed PITR is healthy and take a verified encrypted logical backup.
   Follow `docs/disaster-recovery.md`; an archive is not accepted until an
   isolated restore has passed integrity checks.
3. Review migrations. Schema changes must be backward-compatible expand steps;
   destructive contract steps happen only after old application versions are
   gone and backups have passed retention.
4. Set `IMAGE_TAG` to the immutable candidate and run:

   ```bash
   docker compose --env-file .env.production -f compose.production.yaml pull
   docker compose --env-file .env.production -f compose.production.yaml run --rm migrate
   docker compose --env-file .env.production -f compose.production.yaml up -d api trading-worker billing-worker email-worker retention-worker proxy
   curl --fail --silent "https://$DOMAIN/health/ready"
   ```

5. Verify error rate, latency, worker heartbeat, queue depth, payment callbacks,
   and email delivery before completing the rollout. For flagged changes, use
   the staged procedure and kill-switch rules in `docs/feature-flags.md`.

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

Publish the immutable `ops/postgres/Dockerfile` tools image and schedule the
Compose `backup` profile at least daily. Provision `backup_database_url`, the
public `backup_age_recipient`, and an external `BACKUP_VOLUME_NAME` backed by
off-host durable storage. The job creates an encrypted custom-format dump,
checksum and manifest and exports backup freshness for Prometheus. Use
`ops/postgres/restore.sh` only against a newly created isolated database; it
requires target-bound confirmation and runs `verify-restore.sh`. Full policy and
drill cadence are in `docs/disaster-recovery.md`.
