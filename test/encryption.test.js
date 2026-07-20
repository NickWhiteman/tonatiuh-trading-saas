const { expect } = require('chai');
const { describe, it } = require('node:test');
const crypto = require('crypto');

process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { EncryptionService } = require('../build/plugins/EncryptionService/EncryptionService');

describe('EncryptionService', () => {
  it('encrypts new values with authentication', () => {
    const service = new EncryptionService();
    const encrypted = service.encrypt('desktop secret');
    const parts = encrypted.split(':');
    parts[3] = `${parts[3][0] === '0' ? '1' : '0'}${parts[3].slice(1)}`;

    expect(encrypted).to.match(/^v2:/);
    expect(service.decrypt(encrypted)).to.equal('desktop secret');
    expect(() => service.decrypt(parts.join(':'))).to.throw();
  });

  it('decrypts values written by the legacy AES-CBC format', () => {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = cipher.update('legacy secret', 'utf8', 'hex') + cipher.final('hex');

    expect(new EncryptionService().decrypt(`${iv.toString('hex')}:${encrypted}`)).to.equal('legacy secret');
  });
});
