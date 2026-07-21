const { expect } = require('chai');
const { describe, it } = require('node:test');
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { hashAccountToken } = require('../build/saas/security/account-tokens');

describe('account security tokens', () => {
  it('stores only a one-way token digest', () => {
    const token = 'a-random-one-time-account-token';
    const digest = hashAccountToken(token);
    expect(digest).to.match(/^[a-f0-9]{64}$/);
    expect(digest).not.to.contain(token);
    expect(hashAccountToken(token)).to.equal(digest);
  });

  it('does not accept a modified token as the same credential', () => {
    expect(hashAccountToken('token-a')).not.to.equal(hashAccountToken('token-b'));
  });
});
