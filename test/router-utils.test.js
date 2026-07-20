const { expect } = require('chai');
const { HttpError, parsePositiveId, validateConfigPayload } = require('../build/router/router.utils');

describe('router request validation', () => {
  it('accepts positive integer identifiers', () => {
    expect(parsePositiveId('42')).to.equal(42);
  });

  it('rejects invalid identifiers', () => {
    for (const value of ['0', '-1', '1.5', 'abc']) {
      expect(() => parsePositiveId(value)).to.throw(HttpError).with.property('status', 400);
    }
  });

  it('rejects unknown config fields and invalid value types', () => {
    expect(() => validateConfigPayload({ unexpected: true }, false)).to.throw('Unknown config fields');
    expect(() => validateConfigPayload({ positionSize: 'large' }, false)).to.throw('positionSize');
    expect(() => validateConfigPayload({ isAutoStartTrading: 1 }, false)).to.throw('isAutoStartTrading');
  });

  it('accepts valid partial config updates', () => {
    expect(validateConfigPayload({ id: 1, symbol: 'BTC/USDT', positionSize: 0.1 }, true)).to.deep.equal({
      id: 1,
      symbol: 'BTC/USDT',
      positionSize: 0.1,
    });
  });
});
