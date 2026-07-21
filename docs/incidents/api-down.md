# API unavailable

1. Confirm the alert from a second location and check `/health/live` and `/health/ready`.
2. Check the current deployment, container restarts, PostgreSQL connectivity and saturation.
3. If correlated with a release, roll runtime services back to the previous immutable image; do not reverse migrations.
4. If the database is unavailable, fail over through the managed database procedure and verify RLS roles afterward.
5. Record start/end time, affected routes and organizations, mitigation and follow-up owner.
