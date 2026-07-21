import { createHash, randomBytes } from 'crypto';
import { Router } from 'express';
import { EncryptionService } from '../../plugins/EncryptionService/EncryptionService';
import { tokens, saveRefresh } from '../auth/router';
import { saasQuery, saasTransaction } from '../db/pool';
import { authContext, requireRoles, Role } from '../http/authorization';
import { notFound, SaasHttpError } from '../http/errors';
import { authenticate } from '../http/middleware';
import { objectValue, stringValue, uuidValue } from '../http/validate';
import { writeAuditEvent } from '../services/audit';
import { databaseRateLimit } from '../http/rate-limit';
import { defaultEmailLocale } from '../email/delivery';

export const organizationsRouter=Router();organizationsRouter.use(authenticate);
const invitationRoles:Role[]=['ADMIN','TRADER','ANALYST','BILLING','VIEWER'];
const emailValue=(value:unknown)=>{const email=stringValue(value,'email',320).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new SaasHttpError(400,'VALIDATION_ERROR','Email address is invalid.');return email;};

organizationsRouter.get('/',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`SELECT o.id,o.name,o.status,m.role,m.created_at
  FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY m.created_at`,[auth.userId]);res.json({items:result.rows,currentOrganizationId:auth.organizationId});}catch(error){next(error);}});

organizationsRouter.post('/switch',async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['organizationId']);const organizationId=uuidValue(body.organizationId,'organizationId');
  const membership=(await saasQuery<{role:Role}>('SELECT m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND o.status=\'ACTIVE\'',[auth.userId,organizationId])).rows[0];
  if(!membership)throw notFound('Organization membership was not found.');const session=tokens(auth.userId,organizationId,membership.role);await saveRefresh(auth.userId,organizationId,session.refreshToken);
  await writeAuditEvent(req,'ORGANIZATION_SWITCHED','organization',organizationId);res.json(session);
}catch(error){next(error);}});

organizationsRouter.get('/members',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`SELECT u.id,u.email,u.display_name,m.role,m.created_at
  FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.created_at`,[auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});

organizationsRouter.patch('/members/:userId',requireRoles('OWNER'),async(req,res,next)=>{try{const auth=authContext(req);const userId=uuidValue(req.params.userId,'userId');const body=objectValue(req.body,['role']);const role=stringValue(body.role,'role',20) as Role;
  if(!invitationRoles.includes(role))throw new SaasHttpError(400,'INVALID_ROLE','Role cannot be assigned.');const result=await saasTransaction(async(client)=>{const updated=await client.query(`UPDATE organization_memberships SET role=$3 WHERE organization_id=$1 AND user_id=$2 AND role<>'OWNER' RETURNING user_id`,[auth.organizationId,userId,role]);
    if(updated.rowCount)await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND organization_id=$2',[userId,auth.organizationId]);return updated;});
  if(!result.rowCount)throw new SaasHttpError(409,'MEMBER_NOT_EDITABLE','Owner membership cannot be changed.');await writeAuditEvent(req,'MEMBER_ROLE_UPDATED','user',userId,{role});res.json({updated:true});
}catch(error){next(error);}});

organizationsRouter.delete('/members/:userId',requireRoles('OWNER'),async(req,res,next)=>{try{const auth=authContext(req);const userId=uuidValue(req.params.userId,'userId');const result=await saasTransaction(async(client)=>{const removed=await client.query(
  "DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND role<>'OWNER' RETURNING user_id",[auth.organizationId,userId]);if(removed.rowCount)await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND organization_id=$2',[userId,auth.organizationId]);return removed;});if(!result.rowCount)throw new SaasHttpError(409,'MEMBER_NOT_REMOVABLE','Owner membership cannot be removed.');
  await writeAuditEvent(req,'MEMBER_REMOVED','user',userId);res.status(204).end();
}catch(error){next(error);}});

organizationsRouter.get('/invitations',requireRoles('OWNER','ADMIN'),async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`SELECT id,email,role,expires_at,accepted_at,revoked_at,created_at
  FROM organization_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});

organizationsRouter.post('/invitations',requireRoles('OWNER','ADMIN'),databaseRateLimit('member-invitations',20,3600),async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['email','role']);const email=emailValue(body.email);const role=stringValue(body.role,'role',20) as Role;
  if(!invitationRoles.includes(role)||auth.role==='ADMIN'&&role==='ADMIN')throw new SaasHttpError(403,'INVALID_ROLE','Role cannot be invited.');const token=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(token).digest('hex');
  const invitation=await saasTransaction(async(client)=>{const member=await client.query('SELECT 1 FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.email=$2',[auth.organizationId,email]);if(member.rowCount)throw new SaasHttpError(409,'ALREADY_MEMBER','User is already a member.');
    const result=await client.query(`INSERT INTO organization_invitations(organization_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days')
      ON CONFLICT(organization_id,email) DO UPDATE SET role=EXCLUDED.role,token_hash=EXCLUDED.token_hash,invited_by=EXCLUDED.invited_by,expires_at=EXCLUDED.expires_at,accepted_at=NULL,revoked_at=NULL,created_at=now()
      RETURNING id,email,role,expires_at`,[auth.organizationId,email,role,hash,auth.userId]);const encrypted=new EncryptionService().encrypt(JSON.stringify({token}));
    await client.query("INSERT INTO email_outbox(recipient,template,encrypted_payload,locale) VALUES($1,'INVITE_MEMBER',$2,$3)",[email,encrypted,defaultEmailLocale()]);return result.rows[0];});
  await writeAuditEvent(req,'MEMBER_INVITED','invitation',String(invitation.id),{role});res.status(201).json(invitation);
}catch(error){next(error);}});

organizationsRouter.post('/invitations/accept',async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['token']);const hash=createHash('sha256').update(stringValue(body.token,'token',200)).digest('hex');
  const organizationId=await saasTransaction(async(client)=>{const user=(await client.query<{email:string}>('SELECT email FROM users WHERE id=$1 AND status=\'ACTIVE\'',[auth.userId])).rows[0];
    const invite=(await client.query<{id:string;organization_id:string;email:string;role:Role}>(`SELECT id,organization_id,email,role FROM organization_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,[hash])).rows[0];
    if(!user||!invite||user.email.toLowerCase()!==invite.email.toLowerCase())throw new SaasHttpError(400,'INVALID_INVITATION','Invitation is invalid or expired.');
    await client.query('INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[invite.organization_id,auth.userId,invite.role]);await client.query('UPDATE organization_invitations SET accepted_at=now() WHERE id=$1',[invite.id]);return invite.organization_id;});
  await writeAuditEvent(req,'INVITATION_ACCEPTED','organization',organizationId);res.json({accepted:true,organizationId});
}catch(error){next(error);}});

organizationsRouter.delete('/invitations/:id',requireRoles('OWNER','ADMIN'),async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const result=await saasQuery(`UPDATE organization_invitations SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL RETURNING id`,[id,auth.organizationId]);if(!result.rowCount)throw notFound('Invitation was not found.');await writeAuditEvent(req,'INVITATION_REVOKED','invitation',id);res.status(204).end();}catch(error){next(error);}});
