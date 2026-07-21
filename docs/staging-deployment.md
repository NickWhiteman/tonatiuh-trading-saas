# Staging deployment

Staging runs the production image and topology with isolated infrastructure. It
must never share PostgreSQL, Docker secrets, YooKassa credentials, exchange API
keys, SMTP credentials, backup storage or DNS cookies with production.

## One-time host preparation

1. Provision a dedicated Linux host or VM with Docker Engine, Compose v2 and a
   non-root deployment account allowed to use Docker. Restrict inbound traffic
   to 80/443 and administrative access to a VPN or IP allowlist.
2. Install a dedicated GitHub Actions runner and assign exactly the labels
   `self-hosted`, `linux`, `staging`. Do not attach this runner to pull-request
   workflows or reuse it for production.
3. Create the external Docker secrets declared in `compose.production.yaml`
   using staging-only credentials. Pre-create the durable backup volume and
   configure an off-host backup destination.
4. Create DNS records for the staging API/frontend. Use YooKassa test mode,
   restricted test exchange keys and a non-production email domain or sink.

## GitHub configuration

Create the protected `staging` Environment. Add one multiline environment
variable named `STAGING_ENV_FILE` using `.env.staging.example` as the template,
with all placeholders replaced. Runtime credentials remain Docker secrets on the
host and must not be copied into this GitHub variable.

Run `Deploy staging` from a commit already contained in `main`. Supply the
application, previous application and PostgreSQL tools images as complete
`repository@sha256:...` references plus the HTTPS staging origin. The workflow
validates inputs, applies migrations, rolls out, runs read-only smoke probes and
recreates services from the previous application digest if rollout fails.

Database migrations are not reversed automatically. Keep them expand-compatible
and forward-fix migration failures according to the production runbook.
