# Disaster recovery runbook

1. Declare an incident, appoint an incident commander and record the detection
   time, suspected corruption window and customer impact. Preserve logs and
   failed infrastructure for investigation.
2. Enable maintenance mode at the ingress. Stop trading, billing, email and
   retention workers before choosing a recovery point. Do not allow bots to
   restart while database state is being replaced.
3. Prefer managed failover for an availability-zone failure and PITR for logical
   corruption. Select a recovery point before the first known bad write while
   keeping the 15-minute RPO visible to the incident commander.
4. Restore into a new isolated database or cluster. Never overwrite the only
   production copy. For a logical archive, verify its checksum and use:

   ```bash
   DATABASE_URL_FILE=/run/secrets/restore_database_url \
   BACKUP_FILE=/backups/tonatiuh-YYYYMMDDTHHMMSSZ.dump.age \
   AGE_IDENTITY_FILE=/run/secrets/backup_age_identity \
   EXPECTED_DATABASE_NAME=tonatiuh_recovered \
   RESTORE_MODE=disaster-recovery \
   RESTORE_CONFIRM=restore-tonatiuh:tonatiuh_recovered:disaster-recovery \
   /usr/local/bin/restore.sh
   ```

5. The script must pass migration, table, constraint, RLS and orphan checks.
   Restore the matching `bot-data` consistency-group snapshot. If no consistent
   snapshot exists, keep all bots stopped and reconcile from exchange APIs.
6. Rotate database credentials if compromise is possible. Point a canary API at
   the recovered database and test login, tenant isolation, subscription state,
   feature flags and read-only bot/order views.
7. Before enabling workers, mark stale `PROCESSING` commands for manual review.
   Reconcile open orders and balances directly with every exchange. Do not
   replay START/STOP commands or billing operations solely because their local
   status is ambiguous; use provider/exchange idempotency records.
8. Resume the API, then email and billing workers, and finally trading workers in
   small cohorts. Watch SLOs, queues, reconciliation metrics and exchange errors.
9. Record actual RPO/RTO, recovered backup identifiers, approvals and integrity
   results. Keep the old environment read-only until the post-incident review
   authorizes disposal.
