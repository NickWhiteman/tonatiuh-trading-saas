#!/bin/sh
set -eu
umask 077

root=/opt/tonatiuh
tools_image=${POSTGRES_TOOLS_IMAGE:-tonatiuh-postgres-tools:2026-07-27}
database_url_file="$root/runtime-secrets/database_url_v2"
recipient_file="$root/runtime-secrets/backup-age-recipient"
backup_dir="$root/encrypted-backups"
metrics_dir="$root/backup-metrics"
rclone_config="$root/runtime-secrets/rclone.conf"
remote_file="$root/runtime-secrets/backup-remote"

mkdir -p "$backup_dir" "$metrics_dir"
chmod 0755 "$metrics_dir"
common_args="-e DATABASE_URL_FILE=/run/secrets/database_url -e AGE_RECIPIENT_FILE=/run/secrets/age-recipient -e BACKUP_DIR=/backups -e BACKUP_METRICS_FILE=/metrics/backup.prom -e BACKUP_RETENTION_DAYS=35 -e BACKUP_PRUNE=true"

if [ -f "$rclone_config" ] && [ -f "$remote_file" ]; then
  backup_remote=$(tr -d '\r\n' < "$remote_file")
  docker run --rm --network tonatiuh-production_backend \
    -v "$database_url_file:/run/secrets/database_url:ro" \
    -v "$recipient_file:/run/secrets/age-recipient:ro" \
    -v "$rclone_config:/run/secrets/rclone.conf:ro" \
    -v "$backup_dir:/backups" -v "$metrics_dir:/metrics" \
    $common_args -e "BACKUP_REMOTE=$backup_remote" -e RCLONE_CONFIG_FILE=/run/secrets/rclone.conf \
    "$tools_image" sh -c '/usr/local/bin/backup.sh; chmod 0644 /metrics/backup.prom'
else
  docker run --rm --network tonatiuh-production_backend \
    -v "$database_url_file:/run/secrets/database_url:ro" \
    -v "$recipient_file:/run/secrets/age-recipient:ro" \
    -v "$backup_dir:/backups" -v "$metrics_dir:/metrics" \
    $common_args "$tools_image" sh -c '/usr/local/bin/backup.sh; chmod 0644 /metrics/backup.prom'
fi
