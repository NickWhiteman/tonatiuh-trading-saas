#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL_FILE:?DATABASE_URL_FILE is required}"
: "${AGE_RECIPIENT_FILE:?AGE_RECIPIENT_FILE is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=35}"
: "${BACKUP_PRUNE:=false}"

case "$BACKUP_RETENTION_DAYS" in *[!0-9]*|'') echo 'BACKUP_RETENTION_DAYS must be a positive integer.' >&2;exit 2;; esac
[ "$BACKUP_RETENTION_DAYS" -gt 0 ] || { echo 'BACKUP_RETENTION_DAYS must be positive.' >&2;exit 2; }
case "$BACKUP_PRUNE" in true|false) :;; *) echo 'BACKUP_PRUNE must be true or false.' >&2;exit 2;; esac
[ -f "$DATABASE_URL_FILE" ] || { echo 'Database URL secret was not found.' >&2;exit 2; }
[ -f "$AGE_RECIPIENT_FILE" ] || { echo 'age recipient file was not found.' >&2;exit 2; }
mkdir -p "$BACKUP_DIR"

database_url=$(tr -d '\r\n' < "$DATABASE_URL_FILE")
recipient=$(tr -d '\r\n' < "$AGE_RECIPIENT_FILE")
[ -n "$database_url" ] && [ -n "$recipient" ] || { echo 'Backup secrets must not be empty.' >&2;exit 2; }

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="tonatiuh-$timestamp"
archive="$BACKUP_DIR/$base.dump.age"
checksum="$archive.sha256"
manifest="$BACKUP_DIR/$base.manifest.json"
[ ! -e "$archive" ] && [ ! -e "$checksum" ] && [ ! -e "$manifest" ] || { echo 'Backup name collision.' >&2;exit 2; }

raw_tmp=$(mktemp "$BACKUP_DIR/.tonatiuh-raw.XXXXXX")
archive_tmp=$(mktemp "$BACKUP_DIR/.tonatiuh-age.XXXXXX")
checksum_tmp=$(mktemp "$BACKUP_DIR/.tonatiuh-sha.XXXXXX")
manifest_tmp=$(mktemp "$BACKUP_DIR/.tonatiuh-manifest.XXXXXX")
metrics_tmp=''
cleanup(){ rm -f "$raw_tmp" "$archive_tmp" "$checksum_tmp" "$manifest_tmp";[ -z "$metrics_tmp" ] || rm -f "$metrics_tmp"; }
trap cleanup EXIT HUP INT TERM

started=$(date +%s)
pg_dump --dbname="$database_url" --format=custom --compress=9 --no-owner --no-privileges --file="$raw_tmp"
pg_restore --list "$raw_tmp" >/dev/null
age --encrypt --recipient "$recipient" --output "$archive_tmp" "$raw_tmp"
archive_size=$(wc -c < "$archive_tmp" | tr -d ' ')
archive_sha=$(sha256sum "$archive_tmp" | awk '{print $1}')
printf '%s  %s\n' "$archive_sha" "$base.dump.age" > "$checksum_tmp"
finished=$(date +%s)
duration=$((finished-started))
server_version=$(psql "$database_url" -Atqc 'SHOW server_version' | tr -d '\r\n')
dump_version=$(pg_dump --version | tr -d '\r\n')
printf '{"schemaVersion":1,"createdAt":"%s","archive":"%s","sha256":"%s","sizeBytes":%s,"durationSeconds":%s,"postgresServerVersion":"%s","pgDumpVersion":"%s","encryptedWith":"age"}\n' \
  "$timestamp" "$base.dump.age" "$archive_sha" "$archive_size" "$duration" "$server_version" "$dump_version" > "$manifest_tmp"

mv "$archive_tmp" "$archive"
mv "$checksum_tmp" "$checksum"
mv "$manifest_tmp" "$manifest"

if [ -n "${BACKUP_METRICS_FILE:-}" ];then
  metrics_tmp="$BACKUP_METRICS_FILE.tmp.$$"
  printf '# HELP tonatiuh_backup_last_success_timestamp_seconds Unix timestamp of the last verified encrypted backup.\n# TYPE tonatiuh_backup_last_success_timestamp_seconds gauge\ntonatiuh_backup_last_success_timestamp_seconds %s\n# HELP tonatiuh_backup_duration_seconds Duration of the last backup.\n# TYPE tonatiuh_backup_duration_seconds gauge\ntonatiuh_backup_duration_seconds %s\n' "$finished" "$duration" > "$metrics_tmp"
  mv "$metrics_tmp" "$BACKUP_METRICS_FILE"
fi

if [ "$BACKUP_PRUNE" = 'true' ];then
  find "$BACKUP_DIR" -type f \( -name 'tonatiuh-*.dump.age' -o -name 'tonatiuh-*.dump.age.sha256' -o -name 'tonatiuh-*.manifest.json' \) -mtime "+$BACKUP_RETENTION_DAYS" -delete
fi

printf '%s\n' "$manifest"
