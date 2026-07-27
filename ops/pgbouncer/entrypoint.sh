#!/bin/sh
set -eu
umask 077

: "${POSTGRES_PASSWORD_FILE:?POSTGRES_PASSWORD_FILE is required}"
[ -f "$POSTGRES_PASSWORD_FILE" ] || { echo 'PostgreSQL password secret was not found.' >&2;exit 2; }
password=$(tr -d '\r\n' < "$POSTGRES_PASSWORD_FILE")
[ -n "$password" ] || { echo 'PostgreSQL password secret is empty.' >&2;exit 2; }

runtime=/etc/pgbouncer/runtime
userlist="$runtime/userlist.txt"
config="$runtime/pgbouncer.ini"
escaped_password=$(printf '%s' "$password" | sed 's/\\/\\\\/g;s/"/\\"/g')
printf '"tonatiuh" "%s"\n' "$escaped_password" > "$userlist"
cat > "$config" <<EOF
[databases]
tonatiuh = host=postgres port=5432 dbname=tonatiuh

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = $userlist
pool_mode = session
max_client_conn = 500
default_pool_size = 40
min_pool_size = 5
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 600
server_connect_timeout = 5
query_timeout = 120
client_idle_timeout = 0
ignore_startup_parameters = extra_float_digits
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
admin_users = tonatiuh
stats_users = tonatiuh
pidfile =
EOF
exec pgbouncer "$config"
