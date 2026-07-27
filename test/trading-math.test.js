const { expect } = require('chai');
const { describe, it } = require('node:test');
const {
  calculateBuyBackAmount,
  calculateBuyBackOrderAmount,
  calculatePositionMetrics,
} = require('../build/trading-service/trading-math');

describe('trading math', () => {
  it('calculates long PnL in USDT per one coin and for the whole position', () => {
    expect(calculatePositionMetrics('buy', 2000, 1980, 1)).to.deep.equal({
      pnlPerUnit: -20, pnlRatio: -0.01, positionPnl: -20,
    });
    expect(calculatePositionMetrics('buy', 2000, 1980, 0.25).positionPnl).to.equal(-5);
  });

  it('calculates short PnL with the opposite price direction', () => {
    expect(calculatePositionMetrics('sell', 2000, 1980, 1)).to.deep.equal({
      pnlPerUnit: 20, pnlRatio: 0.01, positionPnl: 20,
    });
  });

  it('calculates the buyback loss threshold relative to one coin', () => {
    expect(calculateBuyBackAmount(1957.86, 0.01, 1)).to.be.closeTo(19.5786, 1e-10);
    expect(calculateBuyBackAmount(1957.86, 0.01, 2)).to.be.closeTo(39.1572, 1e-10);
  });

  it('always returns an order amount in base-coin units', () => {
    expect(calculateBuyBackOrderAmount({
      side:'buy',availableBalance:1000,lastPrice:2000,percentFromBalance:0.1,
      positionSize:0.01,drawdownStep:1,fibonacci:false,
    })).to.equal(0.05);
    expect(calculateBuyBackOrderAmount({
      side:'sell',availableBalance:2,lastPrice:2000,percentFromBalance:0.1,
      positionSize:0.01,drawdownStep:1,fibonacci:false,
    })).to.equal(0.2);
  });
});
