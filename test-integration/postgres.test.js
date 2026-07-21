const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
before(async () => { await pool.query('SELECT 1'); });
after(async () => { await pool.end(); });

async function rollbackTest(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await work(client); }
  finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
}

describe('PostgreSQL migrations', () => {
  it('applies every migration exactly once', async () => {
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(migrations.rows.map(row => row.name), [
      '001_saas_foundation.sql', '002_secure_auth.sql', '003_worker_runtime.sql',
      '004_secure_billing.sql', '005_trading_api.sql', '006_account_security.sql',
      '007_organization_members.sql',
    ]);
  });

  it('creates the critical SaaS tables', async () => {
    const result = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
      AND table_name=ANY($1::text[])`, [['users','organizations','trading_bots','subscriptions','account_tokens','request_rate_limits','organization_invitations']]);
    assert.equal(result.rowCount, 7);
  });
});

describe('tenant database invariants', () => {
  it('rejects a bot linked to another tenant exchange connection', async () => rollbackTest(async client => {
    const orgA = (await client.query("INSERT INTO organizations(name) VALUES('A') RETURNING id")).rows[0].id;
    const orgB = (await client.query("INSERT INTO organizations(name) VALUES('B') RETURNING id")).rows[0].id;
    const connection = (await client.query(`INSERT INTO exchange_connections
      (organization_id,exchange_code,label,credentials_ciphertext,encryption_key_id) VALUES($1,'okx','primary','cipher','v1') RETURNING id`, [orgA])).rows[0].id;
    await assert.rejects(client.query(`INSERT INTO trading_bots(organization_id,exchange_connection_id,name,strategy,configuration)
      VALUES($1,$2,'cross-tenant','VECTOR_PROFIT','{"symbol":"BTC/USDT"}')`, [orgB, connection]), error => error.code === '23503');
  }));

  it('enforces command idempotency inside an organization', async () => rollbackTest(async client => {
    const org = (await client.query("INSERT INTO organizations(name) VALUES('Idempotency') RETURNING id")).rows[0].id;
    const connection = (await client.query(`INSERT INTO exchange_connections
      (organization_id,exchange_code,label,credentials_ciphertext,encryption_key_id) VALUES($1,'okx','primary','cipher','v1') RETURNING id`, [org])).rows[0].id;
    const bot = (await client.query(`INSERT INTO trading_bots(organization_id,exchange_connection_id,name,strategy,configuration)
      VALUES($1,$2,'bot','VECTOR_PROFIT','{"symbol":"BTC/USDT"}') RETURNING id`, [org, connection])).rows[0].id;
    await client.query("INSERT INTO bot_commands(organization_id,bot_id,command,idempotency_key) VALUES($1,$2,'START','same-key')", [org, bot]);
    await assert.rejects(client.query("INSERT INTO bot_commands(organization_id,bot_id,command,idempotency_key) VALUES($1,$2,'STOP','same-key')", [org, bot]), error => error.code === '23505');
  }));
});
