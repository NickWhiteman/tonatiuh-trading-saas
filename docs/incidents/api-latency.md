# Elevated API latency

1. Compare p50/p95 latency, request volume, event-loop lag, CPU, memory and PostgreSQL pool saturation.
2. Identify the normalized routes responsible; inspect slow queries and lock waits without logging sensitive parameters.
3. Scale stateless API replicas only after confirming the database has capacity.
4. Stop expensive administrative queries or provider retries when they cause contention.
5. Capture a trace/query plan for follow-up and verify p95 below one second before resolving.
