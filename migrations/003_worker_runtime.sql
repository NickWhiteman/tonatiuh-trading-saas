ALTER TABLE trading_bots ADD COLUMN worker_instance_id uuid;
ALTER TABLE trading_bots ADD COLUMN worker_pid integer;
ALTER TABLE trading_bots ADD COLUMN heartbeat_at timestamptz;
ALTER TABLE trading_bots ADD COLUMN started_at timestamptz;
CREATE INDEX trading_bots_reconcile_idx ON trading_bots(desired_state, actual_state);
