import { randomUUID } from 'crypto';
import { Router } from 'express';
import { getSaasConfig } from '../config';
import { saasQuery, saasTransaction } from '../db/pool';
import { SaasHttpError, notFound } from '../http/errors';
import { authenticate } from '../http/middleware';
import { objectValue, stringValue } from '../http/validate';
import { hashPassword, verifyPassword } from '../security/password';
import { AccessPayload, createAccessToken, createRefreshToken, hashRefreshToken } from '../security/token';

export const authRouter = Router();
type AccountRow = { id: string; email: string; display_name: string; password_hash: string; organization_id: string; organization_name: string; role: AccessPayload['role'] };
const dummyPasswordHash = 'scrypt$01010101010101010101010101010101$ffb601a03950e409b51a01307ea013f1294b4dd0d841f26a2105d4a31e825bea6c32a145a5a6c75963225d2bc95ac1dc5999f6c3f22dfe5c83cae2762e4b9f56';

function emailValue(value: unknown): string {
  const email = stringValue(value, 'email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SaasHttpError(400, 'VALIDATION_ERROR', 'Email address is invalid.');
  return email;
}

function tokens(userId: string, organizationId: string, role: AccessPayload['role']) {
  const refreshToken = createRefreshToken();
  return { accessToken: createAccessToken({ sub: userId, org: organizationId, role }), refreshToken, expiresIn: getSaasConfig().accessTokenTtlSeconds };
}

async function saveRefresh(userId: string, token: string, familyId = randomUUID()): Promise<void> {
  await saasQuery(
    `INSERT INTO refresh_tokens(user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [userId, familyId, hashRefreshToken(token), getSaasConfig().refreshTokenTtlSeconds],
  );
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['email', 'password', 'displayName', 'organizationName']);
    const email = emailValue(body.email);
    const password = stringValue(body.password, 'password', 128);
    const displayName = stringValue(body.displayName, 'displayName', 120);
    const organizationName = body.organizationName === undefined ? `${displayName}'s workspace` : stringValue(body.organizationName, 'organizationName', 120);
    const result = await saasTransaction(async (client) => {
      const user = (await client.query<{ id: string; email: string; display_name: string }>(
        `INSERT INTO users(email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name`,
        [email, await hashPassword(password), displayName],
      )).rows[0];
      const organization = (await client.query<{ id: string; name: string }>(
        'INSERT INTO organizations(name) VALUES ($1) RETURNING id, name', [organizationName],
      )).rows[0];
      await client.query(`INSERT INTO organization_memberships(organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [organization.id, user.id]);
      return { user, organization };
    });
    const session = tokens(result.user.id, result.organization.id, 'OWNER');
    await saveRefresh(result.user.id, session.refreshToken);
    res.status(201).json({ user: { id: result.user.id, email: result.user.email, displayName: result.user.display_name }, organization: result.organization, ...session });
  } catch (error: unknown) {
    const databaseCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    next(databaseCode === '23505' ? new SaasHttpError(409, 'EMAIL_EXISTS', 'Email is already registered.') : error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['email', 'password']);
    const email = emailValue(body.email);
    const password = stringValue(body.password, 'password', 128);
    const result = await saasQuery<AccountRow>(
      `SELECT u.id, u.email, u.display_name, u.password_hash, m.organization_id, m.role, o.name organization_name
       FROM users u JOIN organization_memberships m ON m.user_id=u.id
       JOIN organizations o ON o.id=m.organization_id
       WHERE u.email=$1 AND u.status='ACTIVE' AND o.status='ACTIVE' ORDER BY m.created_at LIMIT 1`, [email],
    );
    const account = result.rows[0];
    const passwordMatches = await verifyPassword(password, account?.password_hash ?? dummyPasswordHash);
    if (!account?.password_hash || !passwordMatches) {
      throw new SaasHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    const session = tokens(account.id, account.organization_id, account.role);
    await saveRefresh(account.id, session.refreshToken);
    res.json({ user: { id: account.id, email: account.email, displayName: account.display_name }, organization: { id: account.organization_id, name: account.organization_name }, ...session });
  } catch (error) { next(error); }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['refreshToken']);
    const oldToken = stringValue(body.refreshToken, 'refreshToken', 500);
    const rotation = await saasTransaction(async (client) => {
      const result = await client.query<{ id: string; user_id: string; family_id: string; revoked_at: Date | null; expires_at: Date }>(
        'SELECT id, user_id, family_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE', [hashRefreshToken(oldToken)],
      );
      const stored = result.rows[0];
      if (!stored) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
      if (stored.revoked_at) {
        await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE family_id=$1', [stored.family_id]);
        return { reused: true as const };
      }
      if (stored.expires_at <= new Date()) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is expired.');
      const membership = (await client.query<{ organization_id: string; role: AccessPayload['role'] }>(
        `SELECT m.organization_id, m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
         WHERE m.user_id=$1 AND o.status='ACTIVE' ORDER BY m.created_at LIMIT 1`, [stored.user_id],
      )).rows[0];
      if (!membership) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Account access is unavailable.');
      const nextSession = tokens(stored.user_id, membership.organization_id, membership.role);
      const nextId = randomUUID();
      await client.query('UPDATE refresh_tokens SET revoked_at=now(), replaced_by=$2 WHERE id=$1', [stored.id, nextId]);
      await client.query(
        `INSERT INTO refresh_tokens(id,user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(secs => $5))`,
        [nextId, stored.user_id, stored.family_id, hashRefreshToken(nextSession.refreshToken), getSaasConfig().refreshTokenTtlSeconds],
      );
      return { reused: false as const, session: nextSession };
    });
    if (rotation.reused) throw new SaasHttpError(401, 'REFRESH_TOKEN_REUSED', 'Refresh token reuse was detected.');
    res.json(rotation.session);
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['refreshToken']);
    await saasQuery('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE token_hash=$1', [hashRefreshToken(stringValue(body.refreshToken, 'refreshToken', 500))]);
    res.status(204).end();
  } catch (error) { next(error); }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) throw new SaasHttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    const result = await saasQuery(
      `SELECT u.id,u.email,u.display_name,m.role,o.id organization_id,o.name organization_name
       FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id
       WHERE u.id=$1 AND o.id=$2 AND u.status='ACTIVE' AND o.status='ACTIVE'`,
      [auth.userId, auth.organizationId],
    );
    if (!result.rows[0]) throw notFound('Account was not found.');
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});
