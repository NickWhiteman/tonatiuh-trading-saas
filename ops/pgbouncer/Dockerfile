FROM alpine:3.22
RUN apk add --no-cache pgbouncer ca-certificates \
    && install -d -o nobody -g nobody -m 0700 /etc/pgbouncer/runtime
COPY entrypoint.sh /usr/local/bin/pgbouncer-entrypoint
RUN chmod 0555 /usr/local/bin/pgbouncer-entrypoint
USER nobody
ENTRYPOINT ["/usr/local/bin/pgbouncer-entrypoint"]
