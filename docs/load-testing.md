# Load and resilience testing

`npm run test:load` executes the real Express middleware and routing pipeline.
Without `LOAD_TARGET_URL` it uses an in-process transport suitable for restricted
CI. This measures application overhead but excludes TCP/TLS, reverse proxy,
PostgreSQL, exchange and SMTP latency.

For a representative staging test, deploy the production image and run from a
separate load-generator host:

```bash
LOAD_TARGET_URL=https://api.staging.example.com/health/live \
LOAD_DURATION_SECONDS=300 LOAD_WARMUP_SECONDS=30 LOAD_CONCURRENCY=100 \
LOAD_MIN_RPS=100 LOAD_MAX_P95_MS=1000 LOAD_MAX_ERROR_RATE=0.001 \
npm run test:load
```

Use `LOAD_PATH=/api/v1/auth/me` and `LOAD_BEARER_TOKEN` for an authenticated,
database-backed profile. Create dedicated test tenants and credentials; never
load-test production trading or payment mutation endpoints. Increase concurrency
in steps, watching API p95, event-loop lag, PostgreSQL pool wait/locks, CPU,
memory and queue age. Stop when an SLO fails, errors rise, or a downstream
provider approaches its documented limit.

The PostgreSQL integration suite also verifies advisory-lock leader exclusivity
and immediate failover. Idempotency and tenant constraints remain mandatory
under concurrency; a throughput result never overrides correctness assertions.
