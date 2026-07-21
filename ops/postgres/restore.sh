#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL_FILE:?DATABASE_URL_FILE is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"
: "${EXPECTED_DATABASE_NAME:?EXPECTED_DATABASE_NAME is required}"
: "${RESTORE_MODE:?RESTORE_MODE must be isolated-drill or disaster-recovery}"
: "${RESTORE_CONFIRM:?RESTORE_CONFIRM is required}"

case "$RESTORE_MODE" in isolated-drill|disaster-recovery) :;; *) echo 'Invalid RESTORE_MODE.' >&2;exit 2;; esac
expected_confirmation="restore-tonatiuh:$EXPECTED_DATABASE_NAME:$RESTORE_MODE"
[ "$RESTORE_CONFIRM" = "$expected_confirmation" ] || { echo 'Restore confirmation did not match the target and mode.' >&2;exit 2; }
[ -f "$DATABASE_URL_FILE" ] && [ -f "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE.sha256" ] && [ -f "$AGE_IDENTITY_FILE" ] || { echo 'Restore input or mandatory checksum was not found.' >&2;exit 2; }

database_url=$(tr -d '\r\n' < "$DATABASE_URL_FILE")
actual_database=$(psql "$database_url" -Atqc 'SELECT current_database()' | tr -d '\r\n')
[ "$actual_database" = "$EXPECTED_DATABASE_NAME" ] || { echo 'Connected database does not match EXPECTED_DATABASE_NAME.' >&2;exit 2; }

backup_dir=$(dirname "$BACKUP_FILE")
backup_name=$(basename "$BACKUP_FILE")
(cd "$backup_dir" && sha256sum -c "$backup_name.sha256")
raw_tmp=$(mktemp "${TMPDIR:-/tmp}/tonatiuh-restore.XXXXXX")
cleanup(){ rm -f "$raw_tmp"; }
trap cleanup EXIT HUP INT TERM
age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$raw_tmp" "$BACKUP_FILE"
pg_restore --list "$raw_tmp" >/dev/null
pg_restore --dbname="$database_url" --clean --if-exists --no-owner --no-privileges --exit-on-error "$raw_tmp"
psql "$database_url" -v ON_ERROR_STOP=1 -qc 'ANALYZE'
DATABASE_URL_FILE="$DATABASE_URL_FILE" "$(dirname "$0")/verify-restore.sh"
