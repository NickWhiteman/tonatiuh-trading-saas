const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('browser refresh sessions use hardened host-only cookies and credentialed CORS', () => {
  const auth = readFileSync('src/saas/auth/router.ts', 'utf8');
  const app = readFileSync('src/app.ts', 'utf8');
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /Secure/);
  assert.match(auth, /Path=\/api\/v1\/auth/);
  assert.match(auth, /X-CSRF-Protection/);
  assert.match(app, /credentials: true/);
  assert.match(app, /methods: \[[^\]]*'PATCH'[^\]]*\]/);
  assert.match(app, /X-CSRF-Protection/);
});
