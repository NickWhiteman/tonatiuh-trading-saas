const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { describe, it } = require('node:test');

describe('bot SQLite lifecycle', () => {
  it('registers isolated SQLite databases and marks them deleted', async () => {
    const migration = await readFile('migrations/018_bot_sqlite_registry.sql', 'utf8');
    const worker = await readFile('src/saas/worker.ts', 'utf8');
    assert.match(migration, /CREATE TABLE bot_sqlite_databases/);
    assert.match(migration, /is_delete smallint NOT NULL DEFAULT 0/);
    assert.match(worker, /registerSqliteDatabase\(botId\)/);
    assert.match(worker, /SET is_delete=1,deleted_at=now\(\),updated_at=now\(\)/);
    assert.match(worker, /await rename\(botDataDir, stagedDataDir\)/);
    assert.match(worker, /await rm\(stagedDataDir, \{ recursive: true, force: true \}\)/);
  });

  it('deletes only stopped bots without a filled open position', async () => {
    const router = await readFile('src/saas/trading/bots.router.ts', 'utf8');
    assert.match(router, /botsRouter\.delete\('\/:id'/);
    assert.match(router, /\['STOPPED','FAILED'\]\.includes\(bot\.actual_state\)/);
    assert.match(router, /status='FILLED'/);
    assert.match(router, /BOT_HAS_OPEN_POSITION/);
  });
});
