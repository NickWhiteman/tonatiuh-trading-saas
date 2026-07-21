import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { runWithServiceDatabaseContext } from '../db/access-context';
import { saasTransaction } from '../db/pool';
import { SaasHttpError } from '../http/errors';
import { objectValue, stringValue } from '../http/validate';
import { emailHash } from './delivery';

export const emailEventsRouter=Router();
const authorized=(provided:string|undefined,expected:string)=>{if(!provided)return false;const a=Buffer.from(provided);const b=Buffer.from(`Bearer ${expected}`);return a.length===b.length&&timingSafeEqual(a,b);};
emailEventsRouter.post('/provider-events',(req,_res,next)=>runWithServiceDatabaseContext(next),async(req,res,next)=>{try{const secret=optionalEnvConfig('EMAIL_WEBHOOK_TOKEN');
  if(!secret)throw new SaasHttpError(503,'EMAIL_WEBHOOK_NOT_CONFIGURED','Email webhook is not configured.');if(!authorized(req.header('authorization'),secret))throw new SaasHttpError(401,'INVALID_EMAIL_WEBHOOK_TOKEN','Webhook token is invalid.');
  const body=objectValue(req.body,['eventId','messageId','type']);const eventId=stringValue(body.eventId,'eventId',200);const messageId=stringValue(body.messageId,'messageId',500);const type=stringValue(body.type,'type',20);
  if(!['DELIVERED','HARD_BOUNCE','COMPLAINT'].includes(type))throw new SaasHttpError(400,'INVALID_EMAIL_EVENT','Email event type is invalid.');
  await saasTransaction(async client=>{const outbox=(await client.query<{id:string;recipient:string}>('SELECT id,recipient FROM email_outbox WHERE provider_message_id=$1 FOR UPDATE',[messageId])).rows[0];
    const inserted=await client.query(`INSERT INTO email_provider_events(event_id,outbox_id,provider_message_id,event_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`,[eventId,outbox?.id??null,messageId,type]);if(!inserted.rowCount||!outbox)return;
    if(type==='DELIVERED')await client.query("UPDATE email_outbox SET status='DELIVERED',delivered_at=now() WHERE id=$1 AND status='SENT'",[outbox.id]);
    else{await client.query("UPDATE email_outbox SET status='BOUNCED',bounced_at=now() WHERE id=$1",[outbox.id]);await client.query(`INSERT INTO email_suppressions(email_hash,reason,provider_message_id) VALUES($1,$2,$3)
      ON CONFLICT(email_hash) DO UPDATE SET reason=EXCLUDED.reason,provider_message_id=EXCLUDED.provider_message_id,created_at=now()`,[emailHash(outbox.recipient),type==='COMPLAINT'?'COMPLAINT':'HARD_BOUNCE',messageId]);}});
  res.status(202).json({accepted:true});}catch(error){next(error);}});
