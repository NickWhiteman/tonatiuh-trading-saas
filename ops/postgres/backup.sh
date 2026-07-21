#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL_FILE:?DATABASE_URL_FILE is required}"
: "${BACKUP_DIR:=/backups}"
database_url=$(tr -d '\r\n' < "$DATABASE_URL_FILE")
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/tonatiuh-$timestamp.dump"
pg_dump --dbname="$database_url" --format=custom --compress=9 --no-owner --no-privileges --file="$target"
pg_restore --list "$target" >/dev/null
sha256sum "$target" > "$target.sha256"
printf '%s\n' "$target"
