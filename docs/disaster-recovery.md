# Backup and disaster recovery policy

## Objectives and scope

Production targets an RPO of 15 minutes and an RTO of 60 minutes for a regional
PostgreSQL failure. Reaching the RPO requires managed PostgreSQL point-in-time
recovery (continuous WAL archiving); the daily logical backup is an independent,
portable recovery layer and does not replace PITR. Recovery priorities are:

1. account, organization and encrypted exchange-connection records;
2. desired bot state, commands, billing and audit records;
3. transactional email and operational history;
4. derived caches and metrics.

The `bot-data` volume contains per-bot SQLite runtime state and is outside the
PostgreSQL dump. Protect it with encrypted, multi-zone volume snapshots at the
same 15-minute RPO. Use a provider consistency group, or stop trading workers
before a coordinated database backup and volume snapshot. A live file copy of
SQLite files is not an acceptable backup.

## Backup controls

- Enable managed PITR, multi-zone replicas and deletion protection. Retain WAL
  for at least 7 days.
- Run `/usr/local/bin/backup.sh` at least daily using a dedicated backup login.
  The job validates the custom dump, encrypts it to an age recipient, and only
  then atomically publishes the archive, SHA-256 checksum and JSON manifest.
- Keep 35 daily logical backups and at least 12 monthly copies. Store copies in
  a separate account/region with object versioning, retention lock and
  server-side encryption. The Compose backup volume must be backed by such
  durable storage or exported immediately; a host-local volume is not a DR copy.
- Keep the age private identity outside the database account and backup storage,
  preferably in an audited KMS/HSM-backed secret manager. Test key recovery with
  two authorized operators. Never store the identity in the repository.
- The backup account is not an application account. Grant only connection and
  read access required by `pg_dump`; deny application writes and role creation.
- Alert when `tonatiuh_backup_last_success_timestamp_seconds` is absent or older
  than 26 hours. Investigate failed jobs without deleting the last known-good
  generation.

Set `BACKUP_PRUNE=true` only after immutable off-site lifecycle policies are
verified. Local pruning is disabled by default.

## Restore testing

CI builds the PostgreSQL 17/age tools image, backs up the migrated integration
database, restores it into a new database and verifies migrations, critical
tables, constraints, tenant RLS and membership references. This catches format
and script regressions but does not prove production-scale RTO.

Run a restore drill weekly in an isolated non-production account and a
production-sized regional evacuation exercise quarterly. Record backup time,
recovery point, restore duration, integrity checks, application smoke tests and
whether RPO/RTO were met. A backup is not considered recoverable until a restore
drill has succeeded with the current encryption identity and PostgreSQL major
version.

## Ownership

The incident commander authorizes a production restore. A database operator
performs PITR/restore, a trading operator reconciles exchange state and open
orders, and a security operator releases the age identity and reviews audit
evidence. No single operator should both retrieve the recovery key and approve
the production restore.
