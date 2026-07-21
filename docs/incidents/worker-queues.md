# Worker or queue degradation

1. Check leader election, worker restarts, PostgreSQL locks and the oldest queue item age.
2. For stale bot heartbeats, prevent duplicate execution before restarting the leader; confirm the advisory lock owner.
3. Inspect failed items and `last_error`. Do not bulk replay commands or emails until the underlying fault is fixed.
4. Retry only idempotent operations, in bounded batches, while watching provider limits and queue age.
5. Confirm heartbeats and queue age remain healthy for two evaluation windows.
