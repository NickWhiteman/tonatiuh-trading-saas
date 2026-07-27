const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('PgBouncer preserves session semantics required by advisory locks', () => {
  execFileSync('sh', ['-n', 'ops/pgbouncer/entrypoint.sh']);
  const source = readFileSync('ops/pgbouncer/entrypoint.sh', 'utf8');
  assert.match(source, /pool_mode = session/);
  assert.match(source, /max_client_conn = 500/);
  assert.match(source, /POSTGRES_PASSWORD_FILE/);
  assert.doesNotMatch(source, /password\s*=\s*[^$]/);
});

test('database roles are transaction-local and not unsupported startup options', () => {
  const pool = readFileSync('src/saas/db/pool.ts', 'utf8');
  assert.match(pool, /SET LOCAL ROLE/);
  assert.doesNotMatch(pool, /options: `-c role=/);
  assert.match(pool, /tonatiuh_api.*tonatiuh_worker/);
});
