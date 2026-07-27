#!/bin/sh
set -eu

backup_dir=/var/backups/tonatiuh
container=tonatiuh-production-postgres-1
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="${backup_dir}/tonatiuh-${timestamp}.dump"
temporary="${target}.tmp"

install -d -m 0700 "$backup_dir"
docker exec "$container" pg_dump -U tonatiuh -d tonatiuh -Fc > "$temporary"
chmod 0600 "$temporary"
mv "$temporary" "$target"
find "$backup_dir" -type f -name 'tonatiuh-*.dump' -mtime +7 -delete
