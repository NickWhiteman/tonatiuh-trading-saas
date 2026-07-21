# Tonatiuh Trading SaaS

Trading backend used by Tonatiuh desktop and SaaS deployments.

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
