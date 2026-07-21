FROM postgres:17-alpine
RUN apk add --no-cache age
COPY backup.sh restore.sh verify-restore.sh ci-drill.sh /usr/local/bin/
RUN chmod 0555 /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/verify-restore.sh /usr/local/bin/ci-drill.sh
WORKDIR /workspace
