#!/bin/sh
set -eu
umask 077
: "${DRILL_SOURCE_DATABASE_URL:?DRILL_SOURCE_DATABASE_URL is required}"
: "${DRILL_DATABASE_URL:?DRILL_DATABASE_URL is required}"
: "${DRILL_DATABASE_NAME:=tonatiuh_restore_drill}"

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/tonatiuh-drill.XXXXXX")
source_file="$work_dir/source-url"
target_file="$work_dir/target-url"
identity_file="$work_dir/age-identity"
recipient_file="$work_dir/age-recipient"
cleanup(){ dropdb --if-exists --force --maintenance-db="$DRILL_SOURCE_DATABASE_URL" "$DRILL_DATABASE_NAME" >/dev/null 2>&1 || true;rm -f "$source_file" "$target_file" "$identity_file" "$recipient_file";rmdir "$work_dir" 2>/dev/null || true; }
trap cleanup EXIT HUP INT TERM

printf '%s' "$DRILL_SOURCE_DATABASE_URL" > "$source_file"
printf '%s' "$DRILL_DATABASE_URL" > "$target_file"
age-keygen -o "$identity_file" >/dev/null 2>&1
age-keygen -y "$identity_file" > "$recipient_file"
DATABASE_URL_FILE="$source_file" AGE_RECIPIENT_FILE="$recipient_file" BACKUP_DIR="$work_dir" "$(dirname "$0")/backup.sh" >/dev/null
backup_file=$(find "$work_dir" -type f -name 'tonatiuh-*.dump.age' | head -n 1)
[ -n "$backup_file" ] || { echo 'Restore drill did not create a backup.' >&2;exit 1; }
dropdb --if-exists --force --maintenance-db="$DRILL_SOURCE_DATABASE_URL" "$DRILL_DATABASE_NAME"
createdb --maintenance-db="$DRILL_SOURCE_DATABASE_URL" "$DRILL_DATABASE_NAME"
DATABASE_URL_FILE="$target_file" BACKUP_FILE="$backup_file" AGE_IDENTITY_FILE="$identity_file" EXPECTED_DATABASE_NAME="$DRILL_DATABASE_NAME" \
  RESTORE_MODE=isolated-drill RESTORE_CONFIRM="restore-tonatiuh:$DRILL_DATABASE_NAME:isolated-drill" "$(dirname "$0")/restore.sh"
printf 'Encrypted backup restore drill passed.\n'
