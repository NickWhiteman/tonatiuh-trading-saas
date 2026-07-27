# Single-node Swarm production

The production stack uses Docker Swarm for rolling updates, service health
reconciliation, and load balancing. A single node improves container-level
resilience but does not survive loss of the VPS.

## Service topology

- `api`: 2 replicas behind the Swarm VIP.
- `web`: 2 replicas behind the Swarm VIP.
- `proxy`, `postgres`, and each worker: 1 replica.
- PostgreSQL, bot runtime data, and Caddy state reuse the existing external
  Docker volumes.
- PostgreSQL is not published through the Swarm routing mesh. A standalone
  loopback-only `alpine/socat` container provides SSH-tunnel access on
  `127.0.0.1:5432`.
- The daily backup script discovers PostgreSQL through its Swarm service label
  and falls back to the legacy Compose container name during rollback.

## Deployment

Load `.env.server` into the shell, build immutable local images, validate the
stack, run migrations, and deploy with `--resolve-image never`. Use
`docker stack services tonatiuh-production` and `docker service ps` to verify
the desired replicas before considering an update complete.

Updates for `api` and `web` use `start-first`, one replica at a time, and
automatically roll back when a task fails during the monitor window.

## Rollback to Compose

1. Remove the Swarm stack and the loopback database proxy.
2. Wait until all stack tasks and overlay networks are gone.
3. Start `compose.server.yaml` with project name `tonatiuh-production`.
4. Verify PostgreSQL, API readiness, public HTTPS, and bot state.

Do not delete the external volumes or Swarm secrets during rollback.
