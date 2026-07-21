#!/bin/sh
set -eu
: "${DATABASE_URL_FILE:?DATABASE_URL_FILE is required}"
database_url=$(tr -d '\r\n' < "$DATABASE_URL_FILE")

scalar(){ psql "$database_url" -v ON_ERROR_STOP=1 -Atqc "$1"; }
migrations=$(scalar "SELECT count(*) FROM schema_migrations")
[ "$migrations" -ge 14 ] || { echo "Restore verification failed: only $migrations migrations found." >&2;exit 1; }

missing_tables=$(scalar "SELECT count(*) FROM unnest(ARRAY['users','organizations','organization_memberships','exchange_connections','trading_bots','bot_commands','subscriptions','billing_payments','billing_refunds','feature_flags','audit_events']) expected(name) WHERE to_regclass('public.'||name) IS NULL")
[ "$missing_tables" -eq 0 ] || { echo 'Restore verification failed: critical tables are missing.' >&2;exit 1; }

invalid_constraints=$(scalar "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")
[ "$invalid_constraints" -eq 0 ] || { echo 'Restore verification failed: unvalidated constraints found.' >&2;exit 1; }

orphan_memberships=$(scalar 'SELECT count(*) FROM organization_memberships m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN organizations o ON o.id=m.organization_id WHERE u.id IS NULL OR o.id IS NULL')
[ "$orphan_memberships" -eq 0 ] || { echo 'Restore verification failed: orphan memberships found.' >&2;exit 1; }

missing_rls=$(scalar "SELECT count(*) FROM unnest(ARRAY['exchange_connections','trading_bots','bot_commands','subscriptions','billing_payments','billing_refunds','feature_flag_overrides','audit_events']) expected(name) LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||name) WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity")
[ "$missing_rls" -eq 0 ] || { echo 'Restore verification failed: tenant RLS is incomplete.' >&2;exit 1; }
printf 'Restore verification passed: migrations=%s.\n' "$migrations"
