const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const request = require('supertest');

process.env.EMAIL_WEBHOOK_TOKEN='integration-email-webhook-token';
const { createApp } = require('../build/app');
const { EncryptionService } = require('../build/plugins/EncryptionService/EncryptionService');
const { emailHash } = require('../build/saas/email/delivery');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
const app = createApp();
const encryption = new EncryptionService();
const suffix = randomUUID();
const password = 'Correct-Horse-Battery-Staple-42!';
const ownerEmail = `http-owner-${suffix}@example.test`;
const memberEmail = `http-member-${suffix}@example.test`;
const state = { organizationIds: [], userIds: [],eventIds:[] };

async function outboxToken(email, template) {
  const result = await pool.query(
    `SELECT encrypted_payload FROM email_outbox WHERE recipient=$1 AND template=$2 ORDER BY created_at DESC LIMIT 1`,
    [email, template],
  );
  assert.equal(result.rowCount, 1, `${template} message was not queued for ${email}`);
  return JSON.parse(encryption.decrypt(result.rows[0].encrypted_payload)).token;
}

async function registerVerifyAndLogin(email, displayName) {
  const registration = await request(app).post('/api/auth/register').send({
    email,
    password,
    displayName,
    organizationName: `${displayName} workspace`,
    acceptTerms: true,
    acceptPrivacy: true,
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  assert.equal(registration.body.verificationRequired, true);
  assert.equal(registration.body.accessToken, undefined);
  state.userIds.push(registration.body.user.id);
  state.organizationIds.push(registration.body.organization.id);

  const verification = await request(app).post('/api/auth/verify-email').send({
    token: await outboxToken(email, 'VERIFY_EMAIL'),
  });
  assert.equal(verification.status, 200, JSON.stringify(verification.body));
  assert.equal(verification.body.verified, true);

  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.ok(login.body.accessToken);
  assert.ok(login.body.refreshToken);
  return { registration: registration.body, session: login.body };
}

before(async () => { await pool.query('SELECT 1'); });
after(async () => {
  if (state.organizationIds.length) await pool.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [state.organizationIds]);
  if (state.userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [state.userIds]);
  await pool.query('DELETE FROM email_outbox WHERE recipient=ANY($1::text[])', [[ownerEmail, memberEmail]]);
  await pool.query('DELETE FROM email_provider_events WHERE event_id=ANY($1::text[])',[state.eventIds]);
  await pool.query('DELETE FROM email_suppressions WHERE email_hash=ANY($1::text[])',[[emailHash(memberEmail)]]);
  await pool.end();
});

describe('SaaS HTTP lifecycle', () => {
  let owner;
  let member;
  let ownerOrganizationId;
  let switchedAccessToken;

  it('registers, verifies and authenticates an account', async () => {
    owner = await registerVerifyAndLogin(ownerEmail, 'HTTP Owner');
    ownerOrganizationId = owner.registration.organization.id;
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${owner.session.accessToken}`);
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.email, ownerEmail);
    assert.equal(me.body.organization_id, ownerOrganizationId);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const rotation = await request(app).post('/api/auth/refresh').send({ refreshToken: owner.session.refreshToken });
    assert.equal(rotation.status, 200, JSON.stringify(rotation.body));
    assert.notEqual(rotation.body.refreshToken, owner.session.refreshToken);

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: owner.session.refreshToken });
    assert.equal(reuse.status, 401, JSON.stringify(reuse.body));
    assert.equal(reuse.body.error.code, 'REFRESH_TOKEN_REUSED');

    const revokedFamily = await request(app).post('/api/auth/refresh').send({ refreshToken: rotation.body.refreshToken });
    assert.equal(revokedFamily.status, 401, JSON.stringify(revokedFamily.body));
    assert.equal(revokedFamily.body.error.code, 'REFRESH_TOKEN_REUSED');
  });

  it('invites a member and switches their workspace context', async () => {
    member = await registerVerifyAndLogin(memberEmail, 'HTTP Member');
    const invitation = await request(app)
      .post('/api/organizations/invitations')
      .set('Authorization', `Bearer ${owner.session.accessToken}`)
      .send({ email: memberEmail, role: 'VIEWER' });
    assert.equal(invitation.status, 201, JSON.stringify(invitation.body));

    const accepted = await request(app)
      .post('/api/organizations/invitations/accept')
      .set('Authorization', `Bearer ${member.session.accessToken}`)
      .send({ token: await outboxToken(memberEmail, 'INVITE_MEMBER') });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.organizationId, ownerOrganizationId);

    const organizations = await request(app)
      .get('/api/organizations')
      .set('Authorization', `Bearer ${member.session.accessToken}`);
    assert.equal(organizations.status, 200, JSON.stringify(organizations.body));
    assert.equal(organizations.body.items.length, 2);

    const switched = await request(app)
      .post('/api/organizations/switch')
      .set('Authorization', `Bearer ${member.session.accessToken}`)
      .send({ organizationId: ownerOrganizationId });
    assert.equal(switched.status, 200, JSON.stringify(switched.body));
    switchedAccessToken = switched.body.accessToken;
  });

  it('revokes workspace access immediately when membership is removed', async () => {
    const removed = await request(app)
      .delete(`/api/organizations/members/${member.registration.user.id}`)
      .set('Authorization', `Bearer ${owner.session.accessToken}`);
    assert.equal(removed.status, 204, JSON.stringify(removed.body));

    const rejected = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${switchedAccessToken}`);
    assert.equal(rejected.status, 401, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, 'ACCOUNT_ACCESS_REVOKED');
  });

  it('enforces the Platform Admin boundary', async () => {
    const forbidden = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${owner.session.accessToken}`);
    assert.equal(forbidden.status, 403, JSON.stringify(forbidden.body));

    await pool.query("UPDATE users SET platform_role='ADMIN' WHERE id=$1", [owner.registration.user.id]);
    try {
      const allowed = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${owner.session.accessToken}`);
      assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
      assert.equal(typeof allowed.body.users, 'number');
      assert.equal(typeof allowed.body.organizations, 'number');
    } finally {
      await pool.query("UPDATE users SET platform_role='USER' WHERE id=$1", [owner.registration.user.id]);
    }
  });

  it('exports data and supports the account deletion recovery window',async()=>{
    const exported=await request(app).get('/api/auth/me/export').set('Authorization',`Bearer ${owner.session.accessToken}`);
    assert.equal(exported.status,200,JSON.stringify(exported.body));assert.equal(exported.body.user.email,ownerEmail);assert.ok(Array.isArray(exported.body.memberships));
    const scheduled=await request(app).delete('/api/auth/me').set('Authorization',`Bearer ${owner.session.accessToken}`).send({password});
    assert.equal(scheduled.status,202,JSON.stringify(scheduled.body));assert.equal(scheduled.body.retentionDays,30);
    const revoked=await request(app).get('/api/auth/me').set('Authorization',`Bearer ${owner.session.accessToken}`);
    assert.equal(revoked.status,401,JSON.stringify(revoked.body));assert.equal(revoked.body.error.code,'ACCOUNT_ACCESS_REVOKED');
    const cancelled=await request(app).post('/api/auth/cancel-deletion').send({email:ownerEmail,password});
    assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));assert.equal(cancelled.body.cancelled,true);
    const login=await request(app).post('/api/auth/login').send({email:ownerEmail,password});assert.equal(login.status,200,JSON.stringify(login.body));
  });

  it('processes provider events idempotently and suppresses bounced recipients',async()=>{const messageId=`provider-${suffix}`;const eventId=`bounce-${suffix}`;state.eventIds.push(eventId);
    await pool.query(`INSERT INTO email_outbox(recipient,template,encrypted_payload,status,provider_message_id) VALUES($1,'VERIFY_EMAIL','test','SENT',$2)`,[memberEmail,messageId]);
    const payload={eventId,messageId,type:'HARD_BOUNCE'};const first=await request(app).post('/api/email/provider-events').set('Authorization','Bearer integration-email-webhook-token').send(payload);
    assert.equal(first.status,202,JSON.stringify(first.body));const replay=await request(app).post('/api/email/provider-events').set('Authorization','Bearer integration-email-webhook-token').send(payload);assert.equal(replay.status,202);
    const outbox=await pool.query('SELECT status FROM email_outbox WHERE provider_message_id=$1',[messageId]);assert.equal(outbox.rows[0].status,'BOUNCED');
    const suppression=await pool.query('SELECT reason FROM email_suppressions WHERE email_hash=$1',[emailHash(memberEmail)]);assert.equal(suppression.rows[0].reason,'HARD_BOUNCE');
  });
});
