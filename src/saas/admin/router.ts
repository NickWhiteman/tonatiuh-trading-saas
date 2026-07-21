import { Router } from 'express';
import { authenticate } from '../http/middleware';
import { authContext } from '../http/authorization';
import { booleanValue, numberValue, objectValue, stringValue, uuidValue } from '../http/validate';
import { SaasHttpError, notFound } from '../http/errors';
import { saasQuery, saasTransaction } from '../db/pool';
import { writeAuditEvent } from '../services/audit';
import { requirePlatformAdmin } from './authorization';
import { createRefund } from '../billing/yookassa';
import { applyRefundLifecycle, refundSnapshot } from '../billing/lifecycle';
import { getBillingConfig } from '../billing/config';

export const adminRouter=Router();adminRouter.use(authenticate,requirePlatformAdmin);
function pagination(query:Record<string,unknown>){const rawLimit=query.limit===undefined?50:Number(query.limit);const rawOffset=query.offset===undefined?0:Number(query.offset);
  if(!Number.isInteger(rawLimit)||!Number.isInteger(rawOffset)||rawLimit<1||rawOffset<0)throw new SaasHttpError(400,'VALIDATION_ERROR','Pagination values must be positive integers.');
  return{limit:Math.min(100,rawLimit),offset:rawOffset};}
function flagKey(value:unknown){const key=stringValue(value,'key',64);if(!/^[a-z][a-z0-9_]{2,63}$/.test(key))throw new SaasHttpError(400,'INVALID_FEATURE_FLAG','Feature flag key is invalid.');return key;}
function expectedVersion(value:unknown){const version=numberValue(value,'expectedVersion',1,Number.MAX_SAFE_INTEGER);if(!Number.isInteger(version))throw new SaasHttpError(400,'VALIDATION_ERROR','expectedVersion must be an integer.');return version;}

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

adminRouter.get('/data-subject-requests',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const status=typeof req.query.status==='string'?stringValue(req.query.status,'status',20):null;if(status&&!['REQUESTED','IN_PROGRESS','COMPLETED','REJECTED'].includes(status))throw new SaasHttpError(400,'INVALID_STATUS','Status is invalid.');
  const result=await saasQuery(`SELECT r.id,r.user_id,r.kind,r.status,r.metadata,r.requested_at,r.due_at,r.completed_at,r.assigned_to,r.rejection_reason,r.updated_at,
    (r.due_at<now() AND r.status IN ('REQUESTED','IN_PROGRESS')) overdue FROM data_subject_requests r WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.requested_at DESC LIMIT $2 OFFSET $3`,[status,limit,offset]);res.json({items:result.rows,limit,offset});
}catch(error){next(error);}});

adminRouter.patch('/data-subject-requests/:id',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const body=objectValue(req.body,['status','rejectionReason']);const status=stringValue(body.status,'status',20);if(!['IN_PROGRESS','COMPLETED','REJECTED'].includes(status))throw new SaasHttpError(400,'INVALID_STATUS','Status is invalid.');
  const rejectionReason=status==='REJECTED'?stringValue(body.rejectionReason,'rejectionReason',1000):null;const result=await saasQuery(`UPDATE data_subject_requests SET status=$2,assigned_to=$3,rejection_reason=$4,completed_at=CASE WHEN $2 IN ('COMPLETED','REJECTED') THEN now() END,updated_at=now()
    WHERE id=$1 AND status IN ('REQUESTED','IN_PROGRESS') RETURNING id,kind,status,requested_at,due_at,completed_at,assigned_to,rejection_reason,updated_at`,[id,status,auth.userId,rejectionReason]);if(!result.rowCount)throw new SaasHttpError(409,'DATA_REQUEST_NOT_ACTIONABLE','Data request was not found or is already final.');
  await writeAuditEvent(req,'DATA_SUBJECT_REQUEST_STATUS_CHANGED','data_subject_request',id,{status});res.json(result.rows[0]);
}catch(error){next(error);}});

adminRouter.get('/feature-flags',async(_req,res,next)=>{try{const result=await saasQuery(`SELECT f.key,f.description,f.enabled,f.rollout_percentage,f.client_visible,f.version,f.updated_by,f.updated_at,
  count(o.organization_id)::int override_count FROM feature_flags f LEFT JOIN feature_flag_overrides o ON o.flag_key=f.key GROUP BY f.key ORDER BY f.key`);res.json({items:result.rows});}catch(error){next(error);}});

adminRouter.patch('/feature-flags/:key',async(req,res,next)=>{try{const auth=authContext(req);const key=flagKey(req.params.key);const body=objectValue(req.body,['enabled','rolloutPercentage','expectedVersion','changeReason']);
  const enabled=booleanValue(body.enabled,'enabled');const percentage=numberValue(body.rolloutPercentage,'rolloutPercentage',0,100);if(!Number.isInteger(percentage))throw new SaasHttpError(400,'VALIDATION_ERROR','rolloutPercentage must be an integer.');
  const version=expectedVersion(body.expectedVersion);const reason=stringValue(body.changeReason,'changeReason',500);const updated=await saasQuery(`UPDATE feature_flags SET enabled=$2,rollout_percentage=$3,version=version+1,updated_by=$4,updated_at=now()
    WHERE key=$1 AND version=$5 RETURNING key,description,enabled,rollout_percentage,client_visible,version,updated_at`,[key,enabled,percentage,auth.userId,version]);if(!updated.rowCount){const exists=await saasQuery('SELECT 1 FROM feature_flags WHERE key=$1',[key]);if(!exists.rowCount)throw notFound('Feature flag was not found.');throw new SaasHttpError(409,'FEATURE_FLAG_VERSION_CONFLICT','Feature flag was changed by another administrator.');}
  await writeAuditEvent(req,'FEATURE_FLAG_CHANGED','feature_flag',key,{enabled,rolloutPercentage:percentage,previousVersion:version,changeReason:reason});res.json(updated.rows[0]);
}catch(error){next(error);}});

adminRouter.get('/feature-flags/:key/organizations',async(req,res,next)=>{try{const key=flagKey(req.params.key);const{limit,offset}=pagination(req.query);const exists=await saasQuery('SELECT 1 FROM feature_flags WHERE key=$1',[key]);if(!exists.rowCount)throw notFound('Feature flag was not found.');
  const result=await saasQuery(`SELECT o.organization_id,g.name organization_name,o.enabled,o.updated_by,o.updated_at FROM feature_flag_overrides o JOIN organizations g ON g.id=o.organization_id
    WHERE o.flag_key=$1 ORDER BY o.updated_at DESC LIMIT $2 OFFSET $3`,[key,limit,offset]);res.json({items:result.rows,limit,offset});
}catch(error){next(error);}});

adminRouter.put('/feature-flags/:key/organizations/:organizationId',async(req,res,next)=>{try{const auth=authContext(req);const key=flagKey(req.params.key);const organizationId=uuidValue(req.params.organizationId,'organizationId');const body=objectValue(req.body,['enabled','expectedVersion','changeReason']);
  const enabled=booleanValue(body.enabled,'enabled');const version=expectedVersion(body.expectedVersion);const reason=stringValue(body.changeReason,'changeReason',500);await saasTransaction(async client=>{const flag=await client.query('UPDATE feature_flags SET version=version+1,updated_by=$3,updated_at=now() WHERE key=$1 AND version=$2 RETURNING key',[key,version,auth.userId]);
    if(!flag.rowCount)throw new SaasHttpError(409,'FEATURE_FLAG_VERSION_CONFLICT','Feature flag was not found or changed by another administrator.');const organization=await client.query('SELECT 1 FROM organizations WHERE id=$1',[organizationId]);if(!organization.rowCount)throw notFound('Organization was not found.');
    await client.query(`INSERT INTO feature_flag_overrides(flag_key,organization_id,enabled,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(flag_key,organization_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=now()`,[key,organizationId,enabled,auth.userId]);});
  await writeAuditEvent(req,'FEATURE_FLAG_OVERRIDE_SET','feature_flag',key,{organizationId,enabled,previousVersion:version,changeReason:reason});res.json({key,organizationId,enabled,version:version+1});
}catch(error){next(error);}});

adminRouter.delete('/feature-flags/:key/organizations/:organizationId',async(req,res,next)=>{try{const auth=authContext(req);const key=flagKey(req.params.key);const organizationId=uuidValue(req.params.organizationId,'organizationId');const body=objectValue(req.body,['expectedVersion','changeReason']);const version=expectedVersion(body.expectedVersion);const reason=stringValue(body.changeReason,'changeReason',500);
  await saasTransaction(async client=>{const flag=await client.query('UPDATE feature_flags SET version=version+1,updated_by=$3,updated_at=now() WHERE key=$1 AND version=$2 RETURNING key',[key,version,auth.userId]);if(!flag.rowCount)throw new SaasHttpError(409,'FEATURE_FLAG_VERSION_CONFLICT','Feature flag was not found or changed by another administrator.');
    const removed=await client.query('DELETE FROM feature_flag_overrides WHERE flag_key=$1 AND organization_id=$2',[key,organizationId]);if(!removed.rowCount)throw notFound('Feature flag override was not found.');});
  await writeAuditEvent(req,'FEATURE_FLAG_OVERRIDE_REMOVED','feature_flag',key,{organizationId,previousVersion:version,changeReason:reason});res.json({removed:true,version:version+1});
}catch(error){next(error);}});

adminRouter.get('/payments',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const result=await saasQuery(`SELECT id,organization_id,provider_payment_id,kind,status,amount_kopecks,currency,created_at,updated_at
  FROM billing_payments ORDER BY created_at DESC LIMIT $1 OFFSET $2`,[limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});
adminRouter.get('/refunds',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const result=await saasQuery(`SELECT id,organization_id,provider_refund_id,provider_payment_id,status,amount_kopecks,currency,reason,requested_by,created_at,updated_at
  FROM billing_refunds ORDER BY created_at DESC LIMIT $1 OFFSET $2`,[limit,offset]);res.json({items:result.rows,limit,offset});}catch(error){next(error);}});

adminRouter.post('/payments/:id/refund',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const key=String(req.header('idempotency-key')??'').trim();if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new SaasHttpError(400,'IDEMPOTENCY_KEY_REQUIRED','A valid Idempotency-Key header is required.');
  const body=objectValue(req.body,['reason']);const reason=stringValue(body.reason,'reason',500);const reservation=await saasTransaction(async client=>{const payment=(await client.query(`SELECT p.organization_id,p.provider_payment_id,p.amount_kopecks,p.currency,u.email FROM billing_payments p JOIN organization_memberships m ON m.organization_id=p.organization_id AND m.role='OWNER'
      JOIN users u ON u.id=m.user_id WHERE p.id=$1 AND p.status='succeeded' ORDER BY m.created_at LIMIT 1 FOR UPDATE OF p`,[id])).rows[0];if(!payment)throw notFound('Successful payment was not found.');
    const existing=(await client.query(`SELECT r.id,r.organization_id,r.provider_payment_id,r.amount_kopecks,r.reason,u.email FROM billing_refunds r JOIN organization_memberships m ON m.organization_id=r.organization_id AND m.role='OWNER'
      JOIN users u ON u.id=m.user_id WHERE r.organization_id=$1 AND r.idempotency_key=$2 ORDER BY m.created_at LIMIT 1`,[payment.organization_id,key])).rows[0];if(existing){if(existing.provider_payment_id!==payment.provider_payment_id)throw new SaasHttpError(409,'IDEMPOTENCY_KEY_REUSED','Idempotency key belongs to another payment.');return existing;}
    const reserved=await client.query(`SELECT COALESCE(sum(amount_kopecks),0)::int total FROM billing_refunds WHERE provider_payment_id=$1 AND status IN ('requested','pending','succeeded')`,[payment.provider_payment_id]);if(Number(reserved.rows[0].total)>0)throw new SaasHttpError(409,'PAYMENT_ALREADY_REFUNDED','A full refund is already reserved or completed.');
    const inserted=(await client.query(`INSERT INTO billing_refunds(organization_id,provider_payment_id,idempotency_key,status,amount_kopecks,currency,reason,requested_by) VALUES($1,$2,$3,'requested',$4,$5,$6,$7)
      RETURNING id,organization_id,provider_payment_id,amount_kopecks,reason`,[payment.organization_id,payment.provider_payment_id,key,payment.amount_kopecks,payment.currency,reason,auth.userId])).rows[0];return{...inserted,email:payment.email};});
  const refund=await createRefund({paymentId:reservation.provider_payment_id,amountKopecks:reservation.amount_kopecks,email:reservation.email,idempotencyKey:key,reason:reservation.reason});const config=getBillingConfig();await saasTransaction(async client=>{await client.query(`UPDATE billing_refunds SET provider_refund_id=$2,status=$3,provider_snapshot=$4,reconcile_after=CASE WHEN $3='pending' THEN now()+$6*interval '1 minute' END,updated_at=now() WHERE organization_id=$1 AND idempotency_key=$5`,
    [reservation.organization_id,refund.id,refund.status,JSON.stringify(refundSnapshot(refund)),key,config.reconciliationMinutes]);await applyRefundLifecycle(client,refund);});await writeAuditEvent(req,'PAYMENT_REFUND_REQUESTED','payment',id,{refundId:refund.id,reason:reservation.reason});res.status(refund.status==='succeeded'?201:202).json({refundId:refund.id,status:refund.status});
}catch(error){next(error);}});

adminRouter.get('/system',async(_req,res,next)=>{try{const [bots,commands,email]=await Promise.all([saasQuery(`SELECT actual_state,count(*)::int count,max(heartbeat_at) last_heartbeat FROM trading_bots GROUP BY actual_state`),
  saasQuery(`SELECT status,count(*)::int count,min(created_at) oldest FROM bot_commands GROUP BY status`),saasQuery(`SELECT status,count(*)::int count,min(created_at) oldest FROM email_outbox GROUP BY status`)]);res.json({bots:bots.rows,commands:commands.rows,emailOutbox:email.rows});}catch(error){next(error);}});

adminRouter.get('/email/dead-letters',async(req,res,next)=>{try{const{limit,offset}=pagination(req.query);const result=await saasQuery<{id:string;recipient:string;template:string;attempts:number;last_error:string;created_at:Date;last_attempt_at:Date}>(
  `SELECT id,recipient,template,attempts,last_error,created_at,last_attempt_at FROM email_outbox WHERE status='DEAD_LETTER' ORDER BY last_attempt_at DESC NULLS LAST LIMIT $1 OFFSET $2`,[limit,offset]);
  const items=result.rows.map(row=>({...row,recipient:row.recipient.replace(/^(.).+(@.+)$/,'$1***$2')}));res.json({items,limit,offset});}catch(error){next(error);}});

adminRouter.post('/email/dead-letters/:id/retry',async(req,res,next)=>{try{const id=uuidValue(req.params.id,'id');const result=await saasQuery(`UPDATE email_outbox SET status='PENDING',attempts=0,next_attempt_at=now(),last_error=NULL
  WHERE id=$1 AND status='DEAD_LETTER' RETURNING id`,[id]);if(!result.rowCount)throw notFound('Dead-letter email was not found.');await writeAuditEvent(req,'EMAIL_DEAD_LETTER_RETRIED','email_outbox',id);res.status(202).json({queued:true});}catch(error){next(error);}});
