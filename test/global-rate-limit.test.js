const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('all API versions have a bounded per-IP request window', () => {
  const app = readFileSync('src/app.ts', 'utf8');
  const limiter = readFileSync('src/saas/http/rate-limit.ts', 'utf8');
  assert.match(app, /memoryRateLimit\(120, 60_000\)/);
  assert.match(app, /API_V1_PREFIX,apiRateLimit/);
  assert.match(app, /LEGACY_API_PREFIX,apiRateLimit/);
  assert.match(limiter, /Retry-After/);
  assert.match(limiter, /RateLimit-Remaining/);
});
