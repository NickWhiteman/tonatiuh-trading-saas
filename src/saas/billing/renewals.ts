import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { getSaasPool, saasQuery, saasTransaction } from '../db/pool';
import { setProcessDatabaseScope } from '../db/access-context';

setProcessDatabaseScope('worker');
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { getBillingConfig } from './config';
import { createRecurringPayment } from './yookassa';

type Renewal = { organization_id:string;payment_method_id:string;current_period_end:Date;email:string };
let stopping=false;
const interval=Number(optionalEnvConfig('BILLING_WORKER_INTERVAL_MS')??30_000);
if(!Number.isInteger(interval)||interval<1000||interval>300_000)throw new Error('BILLING_WORKER_INTERVAL_MS must be between 1000 and 300000.');

async function claimRenewal():Promise<Renewal|undefined>{return saasTransaction(async(client)=>{
  const result=await client.query<Renewal>(`SELECT s.organization_id,s.payment_method_id,s.current_period_end,u.email FROM subscriptions s
    JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.role='OWNER' JOIN users u ON u.id=m.user_id
    WHERE s.auto_renew=true AND s.payment_method_id IS NOT NULL AND s.current_period_end IS NOT NULL
      AND s.next_billing_at<=now() AND s.status IN ('ACTIVE','PAST_DUE')
    ORDER BY s.next_billing_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`);
  const renewal=result.rows[0];
  if(renewal)await client.query("UPDATE subscriptions SET next_billing_at=now()+interval '15 minutes',updated_at=now() WHERE organization_id=$1",[renewal.organization_id]);
  return renewal;
});}

async function renew(item:Renewal):Promise<void>{
  const idempotencyKey=createHash('sha256').update(`renewal:${item.organization_id}:${item.current_period_end.toISOString()}`).digest('hex');
  try{
    const payment=await createRecurringPayment({organizationId:item.organization_id,email:item.email,paymentMethodId:item.payment_method_id,idempotencyKey});
    const config=getBillingConfig();
    await saasQuery(`INSERT INTO billing_payments(organization_id,provider_payment_id,idempotency_key,kind,status,amount_kopecks,currency,provider_snapshot)
      VALUES($1,$2,$3,'RENEWAL',$4,$5,'RUB',$6) ON CONFLICT(provider_payment_id) DO UPDATE SET status=EXCLUDED.status,provider_snapshot=EXCLUDED.provider_snapshot,updated_at=now()`,
      [item.organization_id,payment.id,idempotencyKey,payment.status,config.priceKopecks,JSON.stringify({id:payment.id,status:payment.status,paid:payment.paid===true,amount:payment.amount,metadata:payment.metadata})]);
    if(payment.status==='canceled')await saasQuery("UPDATE subscriptions SET status='PAST_DUE',next_billing_at=now()+interval '1 day',updated_at=now() WHERE organization_id=$1",[item.organization_id]);
  }catch(error){
    console.error('Subscription renewal failed.',{organizationId:item.organization_id,error});
    await saasQuery("UPDATE subscriptions SET next_billing_at=now()+interval '1 hour',updated_at=now() WHERE organization_id=$1",[item.organization_id]).catch(()=>undefined);
  }
}

async function leader(client:PoolClient):Promise<void>{
  console.log('Billing renewal leader started.');
  while(!stopping){const item=await claimRenewal();if(item)await renew(item);else await new Promise(resolve=>setTimeout(resolve,interval));}
  await client.query("SELECT pg_advisory_unlock(hashtext('tonatiuh-billing-renewals'))");
}

async function main():Promise<void>{while(!stopping){const client=await getSaasPool().connect();try{
  const lock=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext('tonatiuh-billing-renewals')) locked");if(lock.rows[0].locked)await leader(client);
}finally{client.release();}if(!stopping)await new Promise(resolve=>setTimeout(resolve,5000));}await getSaasPool().end();}
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
void main().catch(error=>{console.error('Billing worker failed.',error);process.exitCode=1;});
