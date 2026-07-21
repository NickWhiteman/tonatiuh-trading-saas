const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
before(async () => { await pool.query('SELECT 1'); });
after(async () => { await pool.end(); });

async function rollbackTest(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("SELECT set_config('app.worker_access','true',true)"); await work(client); }
  finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
}

describe('PostgreSQL migrations', () => {
  it('applies every migration exactly once', async () => {
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(migrations.rows.map(row => row.name), [
      '001_saas_foundation.sql', '002_secure_auth.sql', '003_worker_runtime.sql',
      '004_secure_billing.sql', '005_trading_api.sql', '006_account_security.sql',
      '007_organization_members.sql',
      '008_platform_admin.sql',
      '009_postgres_rls.sql',
      '010_data_retention.sql',
      '011_email_delivery.sql',
      '012_entitlements_usage.sql',
      '013_billing_lifecycle.sql',
      '014_feature_flags.sql',
    ]);
  });

  it('creates the critical SaaS tables', async () => {
    const result = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
      AND table_name=ANY($1::text[])`, [['users','organizations','trading_bots','subscriptions','account_tokens','request_rate_limits','organization_invitations','organization_usage_monthly','billing_refunds','feature_flags','feature_flag_overrides']]);
    assert.equal(result.rowCount, 11);
  });
});

describe('tenant database invariants', () => {
  it('isolates tenant rows for the API database role', async () => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const orgA=(await client.query("INSERT INTO organizations(name) VALUES('RLS A') RETURNING id")).rows[0].id;
      const orgB=(await client.query("INSERT INTO organizations(name) VALUES('RLS B') RETURNING id")).rows[0].id;
      await client.query(`INSERT INTO exchange_connections(organization_id,exchange_code,label,credentials_ciphertext,encryption_key_id)
        VALUES($1,'okx','a','cipher','v1'),($2,'okx','b','cipher','v1')`,[orgA,orgB]);
      await client.query('SET LOCAL ROLE tonatiuh_api');
      await client.query("SELECT set_config('app.current_organization_id',$1,true)",[orgA]);
      const visible=await client.query('SELECT organization_id FROM exchange_connections ORDER BY organization_id');
      assert.deepEqual(visible.rows.map(row=>row.organization_id),[orgA]);
      await assert.rejects(client.query(`INSERT INTO exchange_connections(organization_id,exchange_code,label,credentials_ciphertext,encryption_key_id)
        VALUES($1,'okx','blocked','cipher','v1')`,[orgB]),error=>error.code==='42501');
    } finally { await client.query('ROLLBACK').catch(()=>undefined);client.release(); }
  });

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

  it('isolates monthly usage rows for the API database role', async () => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const orgA=(await client.query("INSERT INTO organizations(name) VALUES('Usage RLS A') RETURNING id")).rows[0].id;
      const orgB=(await client.query("INSERT INTO organizations(name) VALUES('Usage RLS B') RETURNING id")).rows[0].id;
      await client.query("INSERT INTO organization_usage_monthly(organization_id,period_start,metric,quantity) VALUES($1,date_trunc('month',now())::date,'BOT_COMMANDS',1),($2,date_trunc('month',now())::date,'BOT_COMMANDS',2)",[orgA,orgB]);
      await client.query('SET LOCAL ROLE tonatiuh_api');
      await client.query("SELECT set_config('app.current_organization_id',$1,true)",[orgA]);
      const visible=await client.query('SELECT organization_id,quantity FROM organization_usage_monthly');
      assert.deepEqual(visible.rows,[{organization_id:orgA,quantity:'1'}]);
    } finally { await client.query('ROLLBACK').catch(()=>undefined);client.release(); }
  });

  it('isolates refund rows for the API database role',async()=>rollbackTest(async client=>{const orgA=(await client.query("INSERT INTO organizations(name) VALUES('Refund A') RETURNING id")).rows[0].id;const orgB=(await client.query("INSERT INTO organizations(name) VALUES('Refund B') RETURNING id")).rows[0].id;
    await client.query(`INSERT INTO billing_payments(organization_id,provider_payment_id,idempotency_key,kind,status,amount_kopecks,currency) VALUES($1,'pay-a','key-a','INITIAL','succeeded',100,'RUB'),($2,'pay-b','key-b','INITIAL','succeeded',100,'RUB')`,[orgA,orgB]);
    await client.query(`INSERT INTO billing_refunds(organization_id,provider_payment_id,idempotency_key,status,amount_kopecks,currency,reason) VALUES($1,'pay-a','refund-a','requested',100,'RUB','test'),($2,'pay-b','refund-b','requested',100,'RUB','test')`,[orgA,orgB]);
    await client.query('SET LOCAL ROLE tonatiuh_api');await client.query("SELECT set_config('app.current_organization_id',$1,true)",[orgA]);const visible=await client.query('SELECT organization_id FROM billing_refunds');assert.deepEqual(visible.rows,[{organization_id:orgA}]);}));

  it('isolates feature flag overrides for the API database role',async()=>rollbackTest(async client=>{const orgA=(await client.query("INSERT INTO organizations(name) VALUES('Flag A') RETURNING id")).rows[0].id;const orgB=(await client.query("INSERT INTO organizations(name) VALUES('Flag B') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO feature_flag_overrides(flag_key,organization_id,enabled) VALUES('billing_checkout',$1,true),('billing_checkout',$2,false)",[orgA,orgB]);await client.query('SET LOCAL ROLE tonatiuh_api');await client.query("SELECT set_config('app.current_organization_id',$1,true)",[orgA]);
    const visible=await client.query('SELECT organization_id,enabled FROM feature_flag_overrides');assert.deepEqual(visible.rows,[{organization_id:orgA,enabled:true}]);}));
});
