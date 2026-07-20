import * as crypto from 'crypto';
import { ENV } from '../Environment/const';

export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    this.key = Buffer.from(ENV.ENCRYPTION_KEY, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal value.');
    }
  }

  encrypt(data: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return ['v2', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt(encryptedData: string | null | undefined): string {
    if (!encryptedData) return '';
    const parts = encryptedData.split(':');

    if (parts[0] === 'v2') {
      const [, ivHex, authTagHex, encryptedHex] = parts;
      if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid encrypted value.');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    }

    // Backward compatibility for records written by the previous AES-CBC format.
    const [ivHex, encryptedHex] = parts;
    if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted value.');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, Buffer.from(ivHex, 'hex'));
    return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  }
}
