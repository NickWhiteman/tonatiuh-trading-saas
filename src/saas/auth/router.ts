import { randomUUID } from 'crypto';
import { Router } from 'express';
import { getSaasConfig } from '../config';
import { saasQuery, saasTransaction } from '../db/pool';
import { SaasHttpError, notFound } from '../http/errors';
import { authenticate } from '../http/middleware';
import { booleanValue, objectValue, stringValue } from '../http/validate';
import { hashPassword, verifyPassword } from '../security/password';
import { AccessPayload, createAccessToken, createRefreshToken, hashRefreshToken } from '../security/token';
import { hashAccountToken, queueAccountEmail } from '../security/account-tokens';
import { databaseRateLimit } from '../http/rate-limit';
import { runWithServiceDatabaseContext } from '../db/access-context';
import {assertCurrentVersions, evidenceHash, recordLegalConsent} from '../compliance/service';
import {getComplianceConfig} from '../compliance/config';
import {authContext} from '../http/authorization';

export const authRouter = Router();
type AccountRow = { id: string; email: string; display_name: string; password_hash: string; status:string; organization_id: string; organization_name: string; role: AccessPayload['role'] };
const dummyPasswordHash = 'scrypt$01010101010101010101010101010101$ffb601a03950e409b51a01307ea013f1294b4dd0d841f26a2105d4a31e825bea6c32a145a5a6c75963225d2bc95ac1dc5999f6c3f22dfe5c83cae2762e4b9f56';
const subjectHash=(email:string)=>evidenceHash(email.toLowerCase(),getComplianceConfig().evidenceSecret);

function emailValue(value: unknown): string {
  const email = stringValue(value, 'email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SaasHttpError(400, 'VALIDATION_ERROR', 'Email address is invalid.');
  return email;
}

export function tokens(userId: string, organizationId: string, role: AccessPayload['role']) {
  const refreshToken = createRefreshToken();
  return { accessToken: createAccessToken({ sub: userId, org: organizationId, role }), refreshToken, expiresIn: getSaasConfig().accessTokenTtlSeconds };
}

export async function saveRefresh(userId: string, organizationId:string, token: string, familyId = randomUUID()): Promise<void> {
  await saasQuery(
    `INSERT INTO refresh_tokens(user_id,organization_id,family_id,token_hash,expires_at)
     VALUES ($1,$2,$3,$4,now()+make_interval(secs => $5))`,
    [userId,organizationId,familyId,hashRefreshToken(token),getSaasConfig().refreshTokenTtlSeconds],
  );
}

authRouter.post('/register',(req,_res,next)=>runWithServiceDatabaseContext(next),databaseRateLimit('register',5,3600), async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['email', 'password', 'displayName', 'organizationName','acceptTerms','acceptPrivacy','termsVersion','privacyVersion']);
    const email = emailValue(body.email);
    const password = stringValue(body.password, 'password', 128);
    const displayName = stringValue(body.displayName, 'displayName', 120);
    const organizationName = body.organizationName === undefined ? `${displayName}'s workspace` : stringValue(body.organizationName, 'organizationName', 120);
    if(!booleanValue(body.acceptTerms,'acceptTerms')||!booleanValue(body.acceptPrivacy,'acceptPrivacy'))throw new SaasHttpError(400,'CONSENT_REQUIRED','Terms and privacy policy consent are required.');
    assertCurrentVersions(body.termsVersion,body.privacyVersion);const compliance=getComplianceConfig();const termsVersion=compliance.documents.terms.version;const privacyVersion=compliance.documents.privacy.version;
    const result = await saasTransaction(async (client) => {
      const user = (await client.query<{ id: string; email: string; display_name: string }>(
        `INSERT INTO users(email,password_hash,display_name,status,terms_version,privacy_version,consented_at) VALUES($1,$2,$3,'PENDING',$4,$5,now()) RETURNING id,email,display_name`,
        [email,await hashPassword(password),displayName,termsVersion,privacyVersion],
      )).rows[0];
      const organization = (await client.query<{ id: string; name: string }>(
        'INSERT INTO organizations(name) VALUES ($1) RETURNING id, name', [organizationName],
      )).rows[0];
      await client.query(`INSERT INTO organization_memberships(organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [organization.id, user.id]);
      await recordLegalConsent(client,req,user,'REGISTRATION');
      await queueAccountEmail(client,{userId:user.id,email:user.email,kind:'VERIFY_EMAIL'});
      return { user, organization };
    });
    res.status(201).json({ user: { id: result.user.id, email: result.user.email, displayName: result.user.display_name }, organization: result.organization, verificationRequired:true });
  } catch (error: unknown) {
    const databaseCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    next(databaseCode === '23505' ? new SaasHttpError(409, 'EMAIL_EXISTS', 'Email is already registered.') : error);
  }
});

authRouter.post('/login',databaseRateLimit('login',10,900), async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['email', 'password']);
    const email = emailValue(body.email);
    const password = stringValue(body.password, 'password', 128);
    const result = await saasQuery<AccountRow>(
      `SELECT u.id, u.email, u.display_name, u.password_hash,u.status, m.organization_id, m.role, o.name organization_name
       FROM users u JOIN organization_memberships m ON m.user_id=u.id
       JOIN organizations o ON o.id=m.organization_id
       WHERE u.email=$1 AND u.status IN ('ACTIVE','PENDING') AND o.status='ACTIVE' ORDER BY m.created_at LIMIT 1`, [email],
    );
    const account = result.rows[0];
    const passwordMatches = await verifyPassword(password, account?.password_hash ?? dummyPasswordHash);
    if (!account?.password_hash || !passwordMatches) {
      throw new SaasHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if(account.status==='PENDING')throw new SaasHttpError(403,'EMAIL_NOT_VERIFIED','Email verification is required.');
    const session = tokens(account.id, account.organization_id, account.role);
    await saveRefresh(account.id,account.organization_id,session.refreshToken);
    res.json({ user: { id: account.id, email: account.email, displayName: account.display_name }, organization: { id: account.organization_id, name: account.organization_name }, ...session });
  } catch (error) { next(error); }
});

authRouter.post('/verify-email',databaseRateLimit('verify-email',10,3600),async(req,res,next)=>{try{
  const body=objectValue(req.body,['token']);const hash=hashAccountToken(stringValue(body.token,'token',200));
  const verified=await saasTransaction(async(client)=>{const row=(await client.query<{id:string}>(`SELECT id FROM account_tokens
    WHERE token_hash=$1 AND kind='VERIFY_EMAIL' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,[hash])).rows[0];
    if(!row)throw new SaasHttpError(400,'INVALID_ACCOUNT_TOKEN','Verification token is invalid or expired.');
    const user=(await client.query<{user_id:string}>('UPDATE account_tokens SET consumed_at=now() WHERE id=$1 RETURNING user_id',[row.id])).rows[0];
    await client.query("UPDATE users SET status='ACTIVE',email_verified_at=now(),updated_at=now() WHERE id=$1",[user.user_id]);return true;});
  res.json({verified});
}catch(error){next(error);}});

authRouter.post('/resend-verification',databaseRateLimit('resend-verification',3,3600),async(req,res,next)=>{try{
  const body=objectValue(req.body,['email']);const email=emailValue(body.email);await saasTransaction(async(client)=>{const user=(await client.query<{id:string}>(
    "SELECT id FROM users WHERE email=$1 AND status='PENDING' FOR UPDATE",[email])).rows[0];if(user)await queueAccountEmail(client,{userId:user.id,email,kind:'VERIFY_EMAIL'});});
  res.status(202).json({accepted:true});
}catch(error){next(error);}});

authRouter.post('/forgot-password',databaseRateLimit('forgot-password',3,3600),async(req,res,next)=>{try{
  const body=objectValue(req.body,['email']);const email=emailValue(body.email);await saasTransaction(async(client)=>{const user=(await client.query<{id:string}>(
    "SELECT id FROM users WHERE email=$1 AND status='ACTIVE' FOR UPDATE",[email])).rows[0];if(user)await queueAccountEmail(client,{userId:user.id,email,kind:'RESET_PASSWORD'});});
  res.status(202).json({accepted:true});
}catch(error){next(error);}});

authRouter.post('/reset-password',databaseRateLimit('reset-password',5,3600),async(req,res,next)=>{try{
  const body=objectValue(req.body,['token','password']);const hash=hashAccountToken(stringValue(body.token,'token',200));
  const password=stringValue(body.password,'password',128);const passwordHash=await hashPassword(password);
  await saasTransaction(async(client)=>{const token=(await client.query<{id:string;user_id:string}>(`SELECT id,user_id FROM account_tokens
    WHERE token_hash=$1 AND kind='RESET_PASSWORD' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,[hash])).rows[0];
    if(!token)throw new SaasHttpError(400,'INVALID_ACCOUNT_TOKEN','Password reset token is invalid or expired.');
    await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[token.user_id,passwordHash]);
    await client.query('UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',[token.user_id]);
    await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[token.user_id]);});
  res.json({reset:true});
}catch(error){next(error);}});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = objectValue(req.body, ['refreshToken']);
    const oldToken = stringValue(body.refreshToken, 'refreshToken', 500);
    const rotation = await saasTransaction(async (client) => {
      const result = await client.query<{ id: string; user_id: string; organization_id:string; family_id: string; revoked_at: Date | null; expires_at: Date }>(
        'SELECT id,user_id,organization_id,family_id,revoked_at,expires_at FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE', [hashRefreshToken(oldToken)],
      );
      const stored = result.rows[0];
      if (!stored) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
      if (stored.revoked_at) {
        await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE family_id=$1', [stored.family_id]);
        return { reused: true as const };
      }
      if (stored.expires_at <= new Date()) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is expired.');
      const membership = (await client.query<{ organization_id: string; role: AccessPayload['role'] }>(
        `SELECT m.organization_id,m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
         JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND o.status='ACTIVE' AND u.status='ACTIVE'`, [stored.user_id,stored.organization_id],
      )).rows[0];
      if (!membership) throw new SaasHttpError(401, 'INVALID_REFRESH_TOKEN', 'Account access is unavailable.');
      const nextSession = tokens(stored.user_id, membership.organization_id, membership.role);
      const nextId = randomUUID();
      await client.query(
        `INSERT INTO refresh_tokens(id,user_id,organization_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(secs => $6))`,
        [nextId,stored.user_id,stored.organization_id,stored.family_id,hashRefreshToken(nextSession.refreshToken),getSaasConfig().refreshTokenTtlSeconds],
      );
      await client.query('UPDATE refresh_tokens SET revoked_at=now(), replaced_by=$2 WHERE id=$1', [stored.id, nextId]);
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

authRouter.post('/cancel-deletion',(req,_res,next)=>runWithServiceDatabaseContext(next),databaseRateLimit('cancel-deletion',5,3600),async(req,res,next)=>{try{const body=objectValue(req.body,['email','password']);const email=emailValue(body.email);const password=stringValue(body.password,'password',128);
  const account=(await saasQuery<{id:string;password_hash:string}>('SELECT id,password_hash FROM users WHERE email=$1 AND status=\'DELETION_PENDING\'',[email])).rows[0];
  if(!await verifyPassword(password,account?.password_hash??dummyPasswordHash)||!account)throw new SaasHttpError(401,'INVALID_CREDENTIALS','Invalid email or password.');
  await saasTransaction(async(client)=>{await client.query("UPDATE users SET status='ACTIVE',deletion_requested_at=NULL,scheduled_deletion_at=NULL,updated_at=now() WHERE id=$1",[account.id]);
    await client.query("INSERT INTO data_subject_requests(user_id,subject_hash,kind,status,completed_at) VALUES($1,$2,'CANCEL_DELETE','COMPLETED',now())",[account.id,subjectHash(email)]);});res.json({cancelled:true});
}catch(error){next(error);}});

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

authRouter.get('/me/export',authenticate,(req,_res,next)=>runWithServiceDatabaseContext(next),async(req,res,next)=>{try{const auth=authContext(req);const user=(await saasQuery(`SELECT id,email,display_name,status,email_verified_at,terms_version,privacy_version,consented_at,created_at FROM users WHERE id=$1`,[auth.userId])).rows[0];
  const [memberships,audit,consents,requests]=await Promise.all([saasQuery(`SELECT o.id organization_id,o.name,m.role,m.created_at FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY m.created_at`,[auth.userId]),
    saasQuery(`SELECT action,entity_type,entity_id,created_at FROM audit_events WHERE actor_user_id=$1 ORDER BY created_at DESC LIMIT 10000`,[auth.userId]),saasQuery(`SELECT document_type,document_version,document_url,document_sha256,source,evidence_key_id,accepted_at FROM consent_events WHERE user_id=$1 ORDER BY accepted_at`,[auth.userId]),
    saasQuery(`SELECT kind,status,requested_at,due_at,completed_at,rejection_reason FROM data_subject_requests WHERE user_id=$1 ORDER BY requested_at`,[auth.userId])]);
  await saasQuery("INSERT INTO data_subject_requests(user_id,subject_hash,kind,status,completed_at) VALUES($1,$2,'EXPORT','COMPLETED',now())",[auth.userId,subjectHash(String(user.email))]);
  res.setHeader('Content-Disposition','attachment; filename="tonatiuh-account-export.json"');res.json({exportedAt:new Date().toISOString(),user,memberships:memberships.rows,consentEvents:consents.rows,dataSubjectRequests:requests.rows,auditEvents:audit.rows});
}catch(error){next(error);}});

authRouter.get('/me/data-requests',authenticate,async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`SELECT id,kind,status,requested_at,due_at,completed_at,rejection_reason,updated_at FROM data_subject_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 100`,[auth.userId]);res.json({items:result.rows});}catch(error){next(error);}});
authRouter.post('/me/data-requests',authenticate,databaseRateLimit('data-subject-request',3,86400),async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['kind','details']);const kind=stringValue(body.kind,'kind',20);if(!['ACCESS','RECTIFY','RESTRICT','OBJECT'].includes(kind))throw new SaasHttpError(400,'INVALID_DATA_REQUEST','Data request kind is invalid.');
  const details=stringValue(body.details,'details',2000);const user=(await saasQuery<{email:string}>('SELECT email FROM users WHERE id=$1',[auth.userId])).rows[0];if(!user)throw notFound('User was not found.');const result=await saasQuery(`INSERT INTO data_subject_requests(user_id,subject_hash,kind,status,metadata) VALUES($1,$2,$3,'REQUESTED',$4) RETURNING id,kind,status,requested_at,due_at`,[auth.userId,subjectHash(user.email),kind,JSON.stringify({details})]);res.status(202).json(result.rows[0]);
}catch(error){next(error);}});

authRouter.delete('/me',authenticate,databaseRateLimit('delete-account',3,86400),async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['password']);const password=stringValue(body.password,'password',128);
  const user=(await saasQuery<{email:string;password_hash:string;platform_role:string}>('SELECT email,password_hash,platform_role FROM users WHERE id=$1 AND status=\'ACTIVE\'',[auth.userId])).rows[0];
  if(!user||!await verifyPassword(password,user.password_hash))throw new SaasHttpError(401,'INVALID_CREDENTIALS','Invalid password.');
  if(user.platform_role==='ADMIN'){const admins=await saasQuery("SELECT 1 FROM users WHERE platform_role='ADMIN' AND status='ACTIVE' AND id<>$1 LIMIT 1",[auth.userId]);if(!admins.rowCount)throw new SaasHttpError(409,'LAST_PLATFORM_ADMIN','Assign another active platform administrator before deleting this account.');}
  const blocking=await saasQuery(`SELECT 1 FROM organization_memberships owner JOIN organization_memberships other ON other.organization_id=owner.organization_id AND other.user_id<>owner.user_id WHERE owner.user_id=$1 AND owner.role='OWNER' LIMIT 1`,[auth.userId]);
  if(blocking.rowCount)throw new SaasHttpError(409,'OWNERSHIP_TRANSFER_REQUIRED','Transfer workspace ownership or remove other members before deleting the account.');
  await saasTransaction(async(client)=>{await client.query("UPDATE users SET status='DELETION_PENDING',deletion_requested_at=now(),scheduled_deletion_at=now()+interval '30 days',updated_at=now() WHERE id=$1",[auth.userId]);
    await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[auth.userId]);await client.query("INSERT INTO data_subject_requests(user_id,subject_hash,kind,status) VALUES($1,$2,'DELETE','REQUESTED')",[auth.userId,subjectHash(user.email)]);});
  res.status(202).json({scheduled:true,retentionDays:30});
}catch(error){next(error);}});
