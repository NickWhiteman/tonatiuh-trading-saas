const { expect } = require('chai');

describe('SaaS access tokens', () => {
  before(() => {
    process.env.DATABASE_URL = 'postgres://unused/unused';
    process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';
  });

  it('signs and verifies required claims', () => {
    const { createAccessToken, verifyAccessToken } = require('../build/saas/security/token');
    const claims = { sub: 'user-id', org: 'organization-id', role: 'OWNER' };
    expect(verifyAccessToken(createAccessToken(claims))).to.deep.equal(claims);
  });

  it('rejects a token with a different audience', () => {
    const jwt = require('jsonwebtoken');
    const { verifyAccessToken } = require('../build/saas/security/token');
    const token = jwt.sign({ org: 'organization-id', role: 'OWNER', typ: 'access' }, process.env.JWT_SECRET, {
      algorithm: 'HS256', subject: 'user-id', issuer: 'test-issuer', audience: 'wrong-audience', expiresIn: 60,
    });
    expect(() => verifyAccessToken(token)).to.throw();
  });
});
