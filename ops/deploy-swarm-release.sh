#!/bin/sh
set -eu

: "${1:?release identifier is required}"
: "${2:?immutable backend image reference is required}"
release=$1
source_image=$2
case "$release" in *[!A-Za-z0-9._-]*|'') echo 'Invalid release identifier.' >&2;exit 2;; esac
case "$source_image" in *@sha256:*) :;; *) echo 'Backend image must use an immutable sha256 digest.' >&2;exit 2;; esac

root=/opt/tonatiuh/tonatiuh-trading-saas
local_image="tonatiuh-production-backend:$release"
previous_image=$(docker service inspect tonatiuh-production_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
rollback(){
  echo 'Deployment verification failed; requesting service rollback.' >&2
  for service in api trading-worker billing-worker email-worker retention-worker; do
    docker service rollback "tonatiuh-production_$service" >/dev/null 2>&1 || true
  done
}
trap rollback HUP INT TERM

docker pull "$source_image"
docker tag "$source_image" "$local_image"
"$root/ops/run-encrypted-backup.sh" >/dev/null
cd "$root"
RELEASE="$release" APP_DOMAIN=tonatiuh.tech API_DOMAIN=api.tonatiuh.tech \
  ACME_EMAIL=romanov_nikita@hotmail.com \
  docker stack deploy --resolve-image never -c compose.swarm.yaml tonatiuh-production

deadline=$(( $(date +%s) + 300 ))
while [ "$(date +%s)" -lt "$deadline" ];do
  unhealthy=$(docker stack services tonatiuh-production --format '{{.Replicas}}' | awk -F/ '$1!=$2{count++}END{print count+0}')
  api_image=$(docker service inspect tonatiuh-production_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
  if [ "$unhealthy" -eq 0 ] && [ "$api_image" = "$local_image" ];then
    curl --fail --silent --show-error --max-time 10 https://api.tonatiuh.tech/health/ready >/dev/null
    trap - HUP INT TERM
    printf 'Deployment %s is healthy (previous API image: %s).\n' "$release" "$previous_image"
    exit 0
  fi
  sleep 10
done
rollback
trap - HUP INT TERM
exit 1
