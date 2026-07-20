const { expect } = require('chai');
const { objectValue, stringValue, booleanValue } = require('../build/saas/http/validate');

describe('SaaS request validation', () => {
  it('rejects unknown fields', () => {
    expect(() => objectValue({ name: 'bot', secret: true }, ['name'])).to.throw('Unknown fields');
  });

  it('normalizes strings and validates booleans', () => {
    expect(stringValue('  bot  ', 'name')).to.equal('bot');
    expect(booleanValue(false, 'enabled')).to.equal(false);
    expect(() => booleanValue('false', 'enabled')).to.throw('must be a boolean');
  });
});
