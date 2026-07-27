const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('production deployment is immutable, health-gated, and rolls back', () => {
  execFileSync('sh', ['-n', 'ops/deploy-swarm-release.sh']);
  const script = readFileSync('ops/deploy-swarm-release.sh', 'utf8');
  const workflow = readFileSync('.github/workflows/production-deploy.yml', 'utf8');
  assert.match(script, /@sha256:/);
  assert.match(script, /docker service rollback/);
  assert.match(script, /health\/ready/);
  assert.match(script, /run-encrypted-backup\.sh/);
  assert.match(workflow, /PRODUCTION_SSH_KNOWN_HOSTS/);
  assert.doesNotMatch(workflow, /ssh-keyscan/);
  assert.match(workflow, /cancel-in-progress: false/);
});
