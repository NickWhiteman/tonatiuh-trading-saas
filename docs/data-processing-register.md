# Data processing register

The controller must replace organizational placeholders and validate lawful
bases with counsel before production launch.

| Data category | Purpose | Candidate basis | Recipients | Engineering retention/control |
| --- | --- | --- | --- | --- |
| Account identity and memberships | account and workspace administration | contract | hosting, transactional email | active account; anonymized after deletion window |
| Consent evidence | prove accepted legal-document version | legal obligation / legitimate interest | legal and security personnel | account lifetime plus six years after deletion |
| Encrypted exchange credentials | perform user-requested trading | contract | selected exchange | removed during account/workspace deletion; encrypted and restricted |
| Orders, sessions and bot configuration | execute and audit trading | contract / legitimate interest | selected exchange, infrastructure provider | product/legal schedule; deletion and backup expiry apply |
| Subscription and payment facts | billing, tax and reconciliation | contract / legal obligation | YooKassa, accounting providers | provider payload minimized after 90 days; statutory facts retained as required |
| Authentication and security logs | prevent abuse and investigate incidents | legitimate interest / legal obligation | infrastructure/security providers | bounded token, audit and log schedules |
| Support and DSAR records | answer requests and prove response | legal obligation | authorized support/legal personnel | pseudonymous request evidence for six years |
| Transactional email | verification and service notices | contract / legitimate interest | configured SMTP provider | payload 30 days; failures 90 days |

Do not use production identity or trading data for model training, advertising or
unrelated analytics. New purposes require a reviewed register update, notice and,
where required, separate consent.
