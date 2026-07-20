ALTER TABLE exchange_connections ADD COLUMN sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE exchange_connections ADD COLUMN last_verified_at timestamptz;

ALTER TABLE exchange_connections ADD CONSTRAINT exchange_connections_id_org_unique UNIQUE(id,organization_id);
ALTER TABLE trading_bots ADD CONSTRAINT trading_bots_id_org_unique UNIQUE(id,organization_id);
ALTER TABLE trading_sessions ADD CONSTRAINT trading_sessions_id_org_unique UNIQUE(id,organization_id);
ALTER TABLE trading_bots DROP CONSTRAINT trading_bots_exchange_connection_id_fkey;
ALTER TABLE trading_bots ADD CONSTRAINT trading_bots_exchange_tenant_fk FOREIGN KEY(exchange_connection_id,organization_id)
  REFERENCES exchange_connections(id,organization_id);
ALTER TABLE bot_commands DROP CONSTRAINT bot_commands_bot_id_fkey;
ALTER TABLE bot_commands ADD CONSTRAINT bot_commands_bot_tenant_fk FOREIGN KEY(bot_id,organization_id)
  REFERENCES trading_bots(id,organization_id) ON DELETE CASCADE;
ALTER TABLE trading_sessions DROP CONSTRAINT trading_sessions_bot_id_fkey;
ALTER TABLE trading_sessions ADD CONSTRAINT trading_sessions_bot_tenant_fk FOREIGN KEY(bot_id,organization_id)
  REFERENCES trading_bots(id,organization_id);
ALTER TABLE orders DROP CONSTRAINT orders_bot_id_fkey;
ALTER TABLE orders DROP CONSTRAINT orders_session_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_bot_tenant_fk FOREIGN KEY(bot_id,organization_id) REFERENCES trading_bots(id,organization_id);
ALTER TABLE orders ADD CONSTRAINT orders_session_tenant_fk FOREIGN KEY(session_id,organization_id) REFERENCES trading_sessions(id,organization_id);
