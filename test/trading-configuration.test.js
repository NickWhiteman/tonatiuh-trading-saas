const { expect } = require('chai');
const { describe, it } = require('node:test');
const { tradingConfiguration } = require('../build/saas/trading/configuration');
const { uuidValue } = require('../build/saas/http/validate');

describe('SaaS trading validation', () => {
  it('normalizes a whitelisted bot configuration', () => {
    expect(tradingConfiguration({ symbol: 'btc/usdt', positionSize: 0.1, isOnlyBuy: true })).to.deep.equal({
      symbol: 'BTC/USDT', positionSize: 0.1, isOnlyBuy: true,
    });
  });

  it('rejects unknown and unsafe strategy values', () => {
    expect(() => tradingConfiguration({ symbol: 'BTC/USDT', apiKey: 'secret' })).to.throw('Unknown fields');
    expect(() => tradingConfiguration({ symbol: 'BTC/USDT', percentFromBalance: 2 })).to.throw('between');
  });

  it('validates resource identifiers before database queries', () => {
    expect(uuidValue('123e4567-e89b-42d3-a456-426614174000', 'id')).to.equal('123e4567-e89b-42d3-a456-426614174000');
    expect(() => uuidValue('../other-tenant', 'id')).to.throw('UUID');
  });
});
