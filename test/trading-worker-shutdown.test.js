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
