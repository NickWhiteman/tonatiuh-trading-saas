const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('infrastructure shutdown suspends bots without closing exchange positions', () => {
  const childWorker = fs.readFileSync(path.join(root, 'src/worker.ts'), 'utf8');
  const supervisor = fs.readFileSync(path.join(root, 'src/saas/worker.ts'), 'utf8');

  assert.match(childWorker, /message\?\.type === 'stop'\) void stopWorker\(true\)/);
  assert.match(childWorker, /message\?\.type === 'suspend'\) void stopWorker\(false\)/);
  assert.match(childWorker, /SIGTERM', \(\) => void stopWorker\(false\)/);
  assert.match(supervisor, /processes\.keys\(\)\]\.map\(suspendBot\)/);
  assert.doesNotMatch(supervisor, /processes\.keys\(\)\]\.map\(stopBot\)/);
});

test('regular stop preserves the position and emergency stop closes it', () => {
  const supervisor = fs.readFileSync(path.join(root, 'src/saas/worker.ts'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'src/saas/trading/bots.router.ts'), 'utf8');

  assert.match(supervisor, /command\.command === 'STOP'\) await stopBot\(command\.bot_id, false\)/);
  assert.match(supervisor, /command\.command === 'EMERGENCY_STOP'\) await stopBot\(command\.bot_id, true\)/);
  assert.match(supervisor, /child\.send\(\{ type: closePosition \? 'stop' : 'suspend' \}\)/);
  assert.match(router, /path:'emergency-stop',command:'EMERGENCY_STOP'/);
});
