import { Router } from 'express';
import { authenticate } from '../http/middleware';
import { authContext } from '../http/authorization';
import { objectValue, stringValue, uuidValue } from '../http/validate';
import { SaasHttpError, notFound } from '../http/errors';
import { saasQuery, saasTransaction } from '../db/pool';
import { writeAuditEvent } from '../services/audit';
import { requirePlatformAdmin } from './authorization';

export const adminRouter=Router();adminRouter.use(authenticate,requirePlatformAdmin);
function pagination(query:Record<string,unknown>){const rawLimit=query.limit===undefined?50:Number(query.limit);const rawOffset=query.offset===undefined?0:Number(query.offset);
  if(!Number.isInteger(rawLimit)||!Number.isInteger(rawOffset)||rawLimit<1||rawOffset<0)throw new SaasHttpError(400,'VALIDATION_ERROR','Pagination values must be positive integers.');
  return{limit:Math.min(100,rawLimit),offset:rawOffset};}

adminRouter.get('/stats',async(_req,res,next)=>{try{const [users,organizations,bots,subscriptions,pendingCommands,pendingEmail]=await Promise.all([
  saasQuery("SELECT count(*)::int count FROM users WHERE status<>'DELETED'"),saasQuery("SELECT count(*)::int count FROM organizations WHERE status<>'CLOSED'"),
  saasQuery('SELECT count(*)::int count FROM trading_bots'),saasQuery("SELECT count(*)::int count FROM subscriptions WHERE status='ACTIVE'"),
  saasQuery("SELECT count(*)::int count FROM bot_commands WHERE status IN ('PENDING','PROCESSING')"),saasQuery("SELECT count(*)::int count FROM email_outbox WHERE status IN ('PENDING','PROCESSING')")]);
  res.json({users:users.rows[0].count,organizations:organizations.rows[0].count,bots:bots.rows[0].count,activeSubscriptions:subscriptions.rows[0].count,
    pendingCommands:pendingCommands.rows[0].count,pendingEmails:pendingEmail.rows[0].count});}catch(error){next(error);}});

adminRouter.get('/users',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const result=await saasQuery(`SELECT id,email,display_name,status,platform_role,email_verified_at,created_at,updated_at FROM users
    WHERE ($1='' OR email ILIKE '%'||$1||'%' OR display_name ILIKE '%'||$1||'%') ORDER BY created_at DESC LIMIT $2 OFFSET $3`,[search,limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});

adminRouter.patch('/users/:id/status',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');if(id===auth.userId)throw new SaasHttpError(409,'SELF_MODIFICATION_FORBIDDEN','Administrator cannot change their own status.');
  const body=objectValue(req.body,['status']);const status=stringValue(body.status,'status',20);if(!['ACTIVE','SUSPENDED'].includes(status))throw new SaasHttpError(400,'INVALID_STATUS','Status is invalid.');
  const result=await saasTransaction(async(client)=>{const updated=await client.query("UPDATE users SET status=$2,updated_at=now() WHERE id=$1 AND status IN ('ACTIVE','SUSPENDED') RETURNING id,status",[id,status]);
    if(updated.rowCount&&status==='SUSPENDED')await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[id]);return updated;});if(!result.rowCount)throw notFound('User was not found.');
  await writeAuditEvent(req,'PLATFORM_USER_STATUS_CHANGED','user',id,{status});res.json(result.rows[0]);}catch(error){next(error);}});

adminRouter.post('/users/:id/revoke-sessions',async(req,res,next)=>{try{const id=uuidValue(req.params.id,'id');const user=await saasQuery('SELECT 1 FROM users WHERE id=$1',[id]);if(!user.rowCount)throw notFound('User was not found.');
  const result=await saasQuery('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL',[id]);await writeAuditEvent(req,'PLATFORM_USER_SESSIONS_REVOKED','user',id,{sessions:result.rowCount});res.json({revoked:result.rowCount});}catch(error){next(error);}});

adminRouter.get('/organizations',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const result=await saasQuery(`SELECT o.id,o.name,o.status,o.created_at,o.updated_at,count(DISTINCT m.user_id)::int member_count,count(DISTINCT b.id)::int bot_count
    FROM organizations o LEFT JOIN organization_memberships m ON m.organization_id=o.id LEFT JOIN trading_bots b ON b.organization_id=o.id
    WHERE ($1='' OR o.name ILIKE '%'||$1||'%') GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,[search,limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});

adminRouter.patch('/organizations/:id/status',async(req,res,next)=>{try{const id=uuidValue(req.params.id,'id');const body=objectValue(req.body,['status']);const status=stringValue(body.status,'status',20);
  if(!['ACTIVE','SUSPENDED'].includes(status))throw new SaasHttpError(400,'INVALID_STATUS','Status is invalid.');const result=await saasTransaction(async(client)=>{const updated=await client.query('UPDATE organizations SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status',[id,status]);
    if(updated.rowCount&&status==='SUSPENDED')await client.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1',[id]);return updated;});if(!result.rowCount)throw notFound('Organization was not found.');
  await writeAuditEvent(req,'PLATFORM_ORGANIZATION_STATUS_CHANGED','organization',id,{status});res.json(result.rows[0]);}catch(error){next(error);}});

adminRouter.get('/audit-events',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const organizationId=typeof req.query.organizationId==='string'?uuidValue(req.query.organizationId,'organizationId'):null;
  const action=typeof req.query.action==='string'?stringValue(req.query.action,'action',100):null;const result=await saasQuery(`SELECT id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,ip_address,metadata,created_at
    FROM audit_events WHERE ($1::uuid IS NULL OR organization_id=$1) AND ($2::text IS NULL OR action=$2) ORDER BY created_at DESC LIMIT $3 OFFSET $4`,[organizationId,action,limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});

adminRouter.get('/payments',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const result=await saasQuery(`SELECT id,organization_id,provider_payment_id,kind,status,amount_kopecks,currency,created_at,updated_at
  FROM billing_payments ORDER BY created_at DESC LIMIT $1 OFFSET $2`,[limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});

adminRouter.get('/system',async(_req,res,next)=>{try{const [bots,commands,email]=await Promise.all([saasQuery(`SELECT actual_state,count(*)::int count,max(heartbeat_at) last_heartbeat FROM trading_bots GROUP BY actual_state`),
  saasQuery(`SELECT status,count(*)::int count,min(created_at) oldest FROM bot_commands GROUP BY status`),saasQuery(`SELECT status,count(*)::int count,min(created_at) oldest FROM email_outbox GROUP BY status`)]);res.json({bots:bots.rows,commands:commands.rows,emailOutbox:email.rows});}catch(error){next(error);}});
