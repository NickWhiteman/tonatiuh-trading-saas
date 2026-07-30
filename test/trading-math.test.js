const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  calculateBuyBackAmount,
  calculateBuyBackOrderAmount,
  calculatePositionMetrics,
  resolvePositionSide,
} = require('../build/trading-service/trading-math');

describe('trading math', () => {
  it('calculates long PnL in USDT per one coin and for the whole position', () => {
    assert.deepEqual(calculatePositionMetrics('buy', 2000, 1980, 1), {
      pnlPerUnit: -20, pnlRatio: -0.01, positionPnl: -20,
    });
    assert.equal(calculatePositionMetrics('buy', 2000, 1980, 0.25).positionPnl, -5);
  });

  it('calculates short PnL with the opposite price direction', () => {
    assert.deepEqual(calculatePositionMetrics('sell', 2000, 1980, 1), {
      pnlPerUnit: 20, pnlRatio: 0.01, positionPnl: 20,
    });
  });

  it('calculates the buyback loss threshold relative to one coin', () => {
    assert.ok(Math.abs(calculateBuyBackAmount(1957.86, 0.01, 1) - 19.5786) < 1e-10);
    assert.ok(Math.abs(calculateBuyBackAmount(1957.86, 0.01, 2) - 39.1572) < 1e-10);
  });

  it('always returns an order amount in base-coin units', () => {
    assert.equal(calculateBuyBackOrderAmount({
      side:'buy',availableBalance:1000,lastPrice:2000,percentFromBalance:0.1,
      positionSize:0.01,drawdownStep:1,fibonacci:false,
    }), 0.05);
    assert.equal(calculateBuyBackOrderAmount({
      side:'sell',availableBalance:2,lastPrice:2000,percentFromBalance:0.1,
      positionSize:0.01,drawdownStep:1,fibonacci:false,
    }), 0.2);
  });

  it('keeps buyback direction equal to the original position direction', () => {
    assert.equal(resolvePositionSide('buy', ['buy', 'buy', 'sell']), 'buy');
    assert.equal(resolvePositionSide('sell', ['sell', 'sell', 'buy']), 'sell');
  });

  it('restores position direction from the first persisted entry order', () => {
    assert.equal(resolvePositionSide(undefined, ['buy', 'sell']), 'buy');
    assert.throws(() => resolvePositionSide(undefined, []), /Position side requires at least one entry order/);
  });
});
