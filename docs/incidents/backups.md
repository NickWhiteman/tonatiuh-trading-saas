# Stale backup runbook

1. Confirm whether `tonatiuh_backup_last_success_timestamp_seconds` is missing
   because the backup job failed or because the textfile exporter is unavailable.
2. Inspect the latest job exit status and manifest. A dump without its checksum
   and manifest is incomplete and must not advance the recovery marker.
3. Check durable-storage capacity, database connectivity, backup-role grants and
   age recipient validity. Do not print connection URLs or key material.
4. Preserve the latest known-good backup. Disable local pruning while correcting
   the failure, then run a manual backup and isolated restore verification.
5. Escalate to a critical incident when the 24-hour logical-backup window or the
   managed PITR RPO is breached. Record the current maximum possible data loss.
