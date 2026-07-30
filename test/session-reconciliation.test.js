const test = require('node:test');
const assert = require('node:assert/strict');
const { isSessionExposureClosed } = require('../build/utils/SessionTrading/session-reconciliation');

test('recognizes a fully offset long position', () => {
  assert.equal(
    isSessionExposureClosed([
      { side: 'buy', amount: 0.001 },
      { side: 'sell', amount: 0.001 },
    ]),
    true,
  );
});

test('keeps a partially offset position active', () => {
  assert.equal(
    isSessionExposureClosed([
      { side: 'buy', amount: 0.002 },
      { side: 'sell', amount: 0.001 },
    ]),
    false,
  );
});

test('does not close a one-direction session', () => {
  assert.equal(
    isSessionExposureClosed([
      { side: 'buy', amount: 0.001 },
      { side: 'buy', amount: 0.001 },
    ]),
    false,
  );
});

test('rejects invalid persisted amounts', () => {
  assert.equal(
    isSessionExposureClosed([
      { side: 'buy', amount: Number.NaN },
      { side: 'sell', amount: 0.001 },
    ]),
    false,
  );
});
