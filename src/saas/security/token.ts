import { createHash, randomBytes } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { getSaasConfig } from '../config';

export type AccessPayload = {
  sub: string;
  org: string;
  role: 'OWNER' | 'ADMIN' | 'TRADER' | 'ANALYST' | 'BILLING' | 'VIEWER';
};

export function createAccessToken(payload: AccessPayload): string {
  const config = getSaasConfig();
  return jwt.sign({ org: payload.org, role: payload.role, typ: 'access' }, config.jwtSecret, {
    algorithm: 'HS256', subject: payload.sub, issuer: config.jwtIssuer,
    audience: config.jwtAudience, expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const config = getSaasConfig();
  const value = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience,
  }) as JwtPayload;
  if (value.typ !== 'access' || typeof value.sub !== 'string' || typeof value.org !== 'string' || typeof value.role !== 'string') {
    throw new Error('Invalid access token claims.');
  }
  const roles = ['OWNER', 'ADMIN', 'TRADER', 'ANALYST', 'BILLING', 'VIEWER'];
  if (!roles.includes(value.role)) throw new Error('Invalid access token role.');
  return { sub: value.sub, org: value.org, role: value.role as AccessPayload['role'] };
}

export const createRefreshToken = (): string => randomBytes(48).toString('base64url');
export const hashRefreshToken = (token: string): string => createHash('sha256').update(token).digest('hex');
