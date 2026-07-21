# Service level objectives

Rolling windows use 30 days and exclude announced maintenance.

| User journey | SLI | Objective |
| --- | --- | --- |
| Authenticated API | non-5xx responses / all responses | 99.9% |
| Authenticated API | p95 request duration | below 1 second |
| Bot commands | commands leaving `PENDING` | within 5 minutes, 99.9% |
| Transactional email | messages leaving `PENDING` | within 10 minutes, 99% |
| Trading heartbeat | running bot heartbeat age | below 90 seconds |

Disaster recovery targets are RPO <= 15 minutes and RTO <= 60 minutes for a
regional PostgreSQL failure. They are validated by weekly isolated restore
drills and quarterly production-sized exercises; CI restore tests validate
tooling compatibility but do not count as an RTO measurement.

The 99.9% availability objective provides about 43 minutes of monthly error
budget. At 50% budget consumption, stop nonessential risky releases. At 100%,
freeze feature releases until the cause is remediated and verified. Alerts use
bounded labels only; user IDs, organization IDs, emails, symbols, and payment IDs
must never become metric labels.
