#!/bin/sh
set -eu

: "${DATABASE_URL_FILE:?DATABASE_URL_FILE is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=restore-tonatiuh to continue}"
[ "$RESTORE_CONFIRM" = "restore-tonatiuh" ] || { echo 'Restore confirmation did not match.' >&2;exit 2; }
[ -f "$BACKUP_FILE" ] || { echo 'Backup file was not found.' >&2;exit 2; }
database_url=$(tr -d '\r\n' < "$DATABASE_URL_FILE")
if [ -f "$BACKUP_FILE.sha256" ];then sha256sum -c "$BACKUP_FILE.sha256";fi
pg_restore --dbname="$database_url" --clean --if-exists --no-owner --no-privileges --exit-on-error "$BACKUP_FILE"
