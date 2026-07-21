# Plans, entitlements and quotas

The API resolves the effective plan from an `ACTIVE` subscription whose
`current_period_end` is in the future. Every other subscription state uses the
FREE entitlements. The public `GET /api/billing/plans` response exposes the same
catalog that enforcement uses; billing-authorized organization members can read
their effective limits and usage through `GET /api/billing/usage`.

| Entitlement | FREE | PRO |
| --- | ---: | ---: |
| Exchange connections | 1 | 5 |
| Trading bots | 1 | 10 |
| Organization members, including active invitations | 1 | 10 |
| START/RESTART commands per calendar month | 0 | 10,000 |
| Live trading | No | Yes |

Resource creation and usage consumption are serialized with transaction-scoped
PostgreSQL advisory locks. The limit check and mutation happen in the same
transaction, so concurrent requests cannot exceed a quota. Replaying an
idempotent bot command does not consume the command quota again.

Quota errors use `409 QUOTA_EXCEEDED` and include the resource, plan, limit and
current usage. A missing feature uses `402 ENTITLEMENT_REQUIRED`. STOP commands
always remain available so an expired or downgraded organization can safely stop
trading.

Downgrading never deletes existing data. If current usage is above a FREE limit,
the organization can read and reduce that data but cannot create another limited
resource. New START/RESTART commands are rejected after PRO expires. Monthly
command usage is stored by UTC calendar month in `organization_usage_monthly`.

Treat the catalog as a versioned product contract. Before changing a limit,
update the API contract, customer-facing copy, tests and migration/backfill plan.
Usage counters are enforcement data, not an invoice ledger; financial records
remain in the billing tables and provider snapshots.
