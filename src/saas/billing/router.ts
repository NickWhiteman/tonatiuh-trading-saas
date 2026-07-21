import { Request, RequestHandler, Router } from 'express';
import { saasQuery, saasTransaction } from '../db/pool';
import { SaasHttpError } from '../http/errors';
import { authenticate } from '../http/middleware';
import { writeAuditEvent } from '../services/audit';
import { getBillingConfig } from './config';
import { createInitialPayment, getPayment, YooPayment } from './yookassa';
import { runWithServiceDatabaseContext } from '../db/access-context';
import { planCatalog } from '../entitlements/catalog';
import { activePlan } from '../entitlements/service';

export const billingRouter = Router();
const billingAccess: RequestHandler = (req, _res, next) => {
  if (!req.auth || !['OWNER', 'BILLING'].includes(req.auth.role)) return next(new SaasHttpError(403, 'FORBIDDEN', 'Billing access is required.'));
  next();
};
function authContext(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw new SaasHttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return req.auth;
}
const snapshot = (payment:YooPayment) => ({ id:payment.id,status:payment.status,paid:payment.paid===true,amount:payment.amount,
  paymentMethodSaved:payment.payment_method?.saved===true,metadata:payment.metadata });
const kopecks = (value:string) => { if(!/^\d+\.\d{2}$/.test(value)) throw new SaasHttpError(400,'INVALID_PAYMENT','Invalid payment amount.'); return Number(value.replace('.','')); };

billingRouter.get('/plans', (_req,res,next) => { try { const c=getBillingConfig(); res.json({items:[{id:'FREE',name:'Free',priceKopecks:0,currency:'RUB',interval:'month',entitlements:planCatalog.FREE},{id:'PRO',name:c.planName,
  priceKopecks:c.priceKopecks,currency:'RUB',interval:'month',entitlements:planCatalog.PRO}]}); } catch(error){next(error);} });

billingRouter.post('/webhook',(req,_res,next)=>runWithServiceDatabaseContext(next), async (req,res,next) => {
  try {
    const event = req.body as { event?:unknown; object?:{id?:unknown} };
    if (!['payment.succeeded','payment.canceled'].includes(String(event.event))) throw new SaasHttpError(400,'INVALID_NOTIFICATION','Unsupported notification event.');
    const paymentId=event.object?.id;
    if(typeof paymentId!=='string'||paymentId.length>128) throw new SaasHttpError(400,'INVALID_NOTIFICATION','Payment id is required.');
    const payment=await getPayment(paymentId);
    if(String(event.event)!==`payment.${payment.status}`) throw new SaasHttpError(409,'PAYMENT_MISMATCH','Notification status does not match payment status.');
    const local=(await saasQuery<{organization_id:string;amount_kopecks:number;currency:string;kind:string}>(
      'SELECT organization_id,amount_kopecks,currency,kind FROM billing_payments WHERE provider_payment_id=$1',[payment.id])).rows[0];
    if(!local) throw new SaasHttpError(404,'PAYMENT_NOT_FOUND','Payment is unknown.');
    if(payment.metadata?.organizationId!==local.organization_id||payment.metadata?.kind!==local.kind||payment.amount.currency!==local.currency||kopecks(payment.amount.value)!==local.amount_kopecks)
      throw new SaasHttpError(409,'PAYMENT_MISMATCH','Payment verification failed.');
    const eventId=`${String(event.event)}:${payment.id}`;
    await saasTransaction(async(client)=>{
      const inserted=await client.query(`INSERT INTO billing_events(provider_event_id,provider_payment_id,event_type,provider_snapshot)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING provider_event_id`,[eventId,payment.id,event.event,JSON.stringify(snapshot(payment))]);
      if(!inserted.rowCount)return;
      await client.query('UPDATE billing_payments SET status=$2,provider_snapshot=$3,updated_at=now() WHERE provider_payment_id=$1',
        [payment.id,payment.status,JSON.stringify(snapshot(payment))]);
      if(payment.status==='succeeded'&&payment.paid===true){
        const method=payment.payment_method?.saved===true?payment.payment_method.id:null;
        await client.query(`INSERT INTO subscriptions(organization_id,plan,status,current_period_end,payment_method_id,auto_renew,next_billing_at,last_payment_id)
          VALUES($1,'PRO','ACTIVE',now()+interval '1 month',$3,$3 IS NOT NULL,CASE WHEN $3 IS NOT NULL THEN now()+interval '1 month' END,$2)
          ON CONFLICT(organization_id) DO UPDATE SET plan='PRO',status='ACTIVE',
          current_period_end=GREATEST(COALESCE(subscriptions.current_period_end,now()),now())+interval '1 month',
          payment_method_id=COALESCE($3,subscriptions.payment_method_id),auto_renew=CASE WHEN $3 IS NULL THEN subscriptions.auto_renew ELSE true END,
          next_billing_at=CASE WHEN $3 IS NULL THEN subscriptions.next_billing_at ELSE GREATEST(COALESCE(subscriptions.current_period_end,now()),now())+interval '1 month' END,
          cancel_at_period_end=false,last_payment_id=$2,updated_at=now()`,[local.organization_id,payment.id,method]);
      } else if(payment.status==='canceled'&&local.kind==='RENEWAL') {
        await client.query("UPDATE subscriptions SET status='PAST_DUE',updated_at=now() WHERE organization_id=$1",[local.organization_id]);
      }
    });
    res.json({received:true});
  } catch(error){next(error);}
});

billingRouter.use(authenticate,billingAccess);
billingRouter.get('/subscription',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(
  `SELECT plan,status,current_period_end,cancel_at_period_end,auto_renew,next_billing_at,(payment_method_id IS NOT NULL) payment_method_saved
   FROM subscriptions WHERE organization_id=$1`,[auth.organizationId]);res.json(result.rows[0]??{plan:'FREE',status:'INACTIVE',autoRenew:false});}catch(error){next(error);}});

billingRouter.get('/usage',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasTransaction(async client=>{const plan=await activePlan(client,auth.organizationId);const [exchanges,bots,members,commands]=await Promise.all([
  client.query<{count:number}>('SELECT count(*)::int count FROM exchange_connections WHERE organization_id=$1',[auth.organizationId]),client.query<{count:number}>('SELECT count(*)::int count FROM trading_bots WHERE organization_id=$1',[auth.organizationId]),
  client.query<{count:number}>('SELECT count(*)::int count FROM organization_memberships WHERE organization_id=$1',[auth.organizationId]),client.query<{quantity:string}>("SELECT quantity FROM organization_usage_monthly WHERE organization_id=$1 AND period_start=date_trunc('month',now())::date AND metric='BOT_COMMANDS'",[auth.organizationId])]);
  const now=new Date();const periodStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
  return{plan,entitlements:planCatalog[plan],usage:{exchangeConnections:exchanges.rows[0].count,bots:bots.rows[0].count,members:members.rows[0].count,monthlyBotCommands:Number(commands.rows[0]?.quantity??0)},periodStart};});res.json(result);
}catch(error){next(error);}});

billingRouter.post('/checkout',async(req,res,next)=>{try{
  const auth=authContext(req);
  const idempotencyKey=String(req.header('idempotency-key')??'').trim();
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))throw new SaasHttpError(400,'IDEMPOTENCY_KEY_REQUIRED','A valid Idempotency-Key header is required.');
  const existing=(await saasQuery<{provider_payment_id:string;provider_snapshot:{confirmationUrl?:string}}>(
    'SELECT provider_payment_id,provider_snapshot FROM billing_payments WHERE organization_id=$1 AND idempotency_key=$2',[auth.organizationId,idempotencyKey])).rows[0];
  if(existing?.provider_snapshot.confirmationUrl)return res.json({paymentId:existing.provider_payment_id,url:existing.provider_snapshot.confirmationUrl});
  const user=(await saasQuery<{email:string}>('SELECT email FROM users WHERE id=$1',[auth.userId])).rows[0];
  if(!user)throw new SaasHttpError(404,'NOT_FOUND','User was not found.');
  const payment=await createInitialPayment({organizationId:auth.organizationId,email:user.email,idempotencyKey});
  const url=payment.confirmation?.confirmation_url;if(!url)throw new SaasHttpError(502,'PAYMENT_PROVIDER_ERROR','Payment confirmation URL is unavailable.');
  const c=getBillingConfig(); const stored={...snapshot(payment),confirmationUrl:url};
  await saasQuery(`INSERT INTO billing_payments(organization_id,provider_payment_id,idempotency_key,kind,status,amount_kopecks,currency,provider_snapshot)
    VALUES($1,$2,$3,'INITIAL',$4,$5,'RUB',$6) ON CONFLICT(organization_id,idempotency_key) DO NOTHING`,
    [auth.organizationId,payment.id,idempotencyKey,payment.status,c.priceKopecks,JSON.stringify(stored)]);
  await writeAuditEvent(req,'CHECKOUT_CREATED','payment',payment.id);res.status(201).json({paymentId:payment.id,url});
}catch(error){next(error);}});

billingRouter.post('/cancel',async(req,res,next)=>{try{const auth=authContext(req);await saasQuery(`UPDATE subscriptions SET auto_renew=false,cancel_at_period_end=true,next_billing_at=NULL,updated_at=now() WHERE organization_id=$1`,[auth.organizationId]);await writeAuditEvent(req,'SUBSCRIPTION_CANCELLED','organization',auth.organizationId);res.json({ok:true});}catch(error){next(error);}});
billingRouter.post('/resume',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`UPDATE subscriptions SET auto_renew=true,cancel_at_period_end=false,next_billing_at=current_period_end,updated_at=now()
  WHERE organization_id=$1 AND payment_method_id IS NOT NULL AND current_period_end>now() RETURNING organization_id`,[auth.organizationId]);
  if(!result.rowCount)throw new SaasHttpError(409,'PAYMENT_METHOD_REQUIRED','An active subscription with a saved payment method is required.');
  await writeAuditEvent(req,'SUBSCRIPTION_RESUMED','organization',auth.organizationId);res.json({ok:true});}catch(error){next(error);}});
