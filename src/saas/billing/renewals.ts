import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { getSaasPool, saasQuery, saasTransaction } from '../db/pool';
import { setProcessDatabaseScope } from '../db/access-context';

setProcessDatabaseScope('worker');
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { getBillingConfig } from './config';
import { createRecurringPayment, getPayment, getRefund } from './yookassa';
import { applyPaymentLifecycle, applyRefundLifecycle, LocalPayment, paymentSnapshot, refundSnapshot } from './lifecycle';

type Renewal = { organization_id:string;payment_method_id:string;current_period_end:Date;email:string;retry_count:number };
type Reconciliation=LocalPayment&{provider_payment_id:string};
type RefundReconciliation={provider_refund_id:string};
let stopping=false;
const interval=Number(optionalEnvConfig('BILLING_WORKER_INTERVAL_MS')??30_000);
if(!Number.isInteger(interval)||interval<1000||interval>300_000)throw new Error('BILLING_WORKER_INTERVAL_MS must be between 1000 and 300000.');

async function claimRenewal():Promise<Renewal|undefined>{return saasTransaction(async(client)=>{
  const result=await client.query<Renewal>(`SELECT s.organization_id,s.payment_method_id,s.current_period_end,s.retry_count,u.email FROM subscriptions s
    JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.role='OWNER' JOIN users u ON u.id=m.user_id
    WHERE s.auto_renew=true AND s.payment_method_id IS NOT NULL AND s.current_period_end IS NOT NULL
      AND s.next_billing_at<=now() AND s.status IN ('ACTIVE','PAST_DUE')
    ORDER BY s.next_billing_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`);
  const renewal=result.rows[0];
  if(renewal)await client.query("UPDATE subscriptions SET next_billing_at=now()+interval '15 minutes',last_billing_attempt_at=now(),updated_at=now() WHERE organization_id=$1",[renewal.organization_id]);
  return renewal;
});}

async function renew(item:Renewal):Promise<void>{
  const attempt=item.retry_count+1;const idempotencyKey=createHash('sha256').update(`renewal:${item.organization_id}:${item.current_period_end.toISOString()}:${attempt}`).digest('hex');
  try{
    const payment=await createRecurringPayment({organizationId:item.organization_id,email:item.email,paymentMethodId:item.payment_method_id,idempotencyKey});
    const config=getBillingConfig();
    await saasTransaction(async client=>{await client.query(`INSERT INTO billing_payments(organization_id,provider_payment_id,idempotency_key,kind,status,amount_kopecks,currency,provider_snapshot,attempt_number,reconcile_after)
      VALUES($1,$2,$3,'RENEWAL',$4,$5,'RUB',$6,$7,CASE WHEN $4 IN ('pending','waiting_for_capture') THEN now()+$8*interval '1 minute' END)
      ON CONFLICT(provider_payment_id) DO UPDATE SET status=EXCLUDED.status,provider_snapshot=EXCLUDED.provider_snapshot,updated_at=now()`,
      [item.organization_id,payment.id,idempotencyKey,payment.status,config.priceKopecks,JSON.stringify(paymentSnapshot(payment)),attempt,config.reconciliationMinutes]);
      await applyPaymentLifecycle(client,{organization_id:item.organization_id,provider_payment_id:payment.id,kind:'RENEWAL',attempt_number:attempt},payment,config);});
  }catch(error){
    console.error('Subscription renewal failed.',{organizationId:item.organization_id,error});
    await saasQuery("UPDATE subscriptions SET next_billing_at=now()+interval '1 hour',updated_at=now() WHERE organization_id=$1",[item.organization_id]).catch(()=>undefined);
  }
}

async function claimReconciliation():Promise<Reconciliation|undefined>{return saasTransaction(async client=>{const row=(await client.query<Reconciliation>(`SELECT organization_id,provider_payment_id,kind,attempt_number FROM billing_payments
  WHERE reconcile_after<=now() AND status IN ('pending','waiting_for_capture') ORDER BY reconcile_after FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];if(row)await client.query("UPDATE billing_payments SET reconcile_after=now()+interval '15 minutes' WHERE provider_payment_id=$1",[row.provider_payment_id]);return row;});}
async function reconcile(item:Reconciliation):Promise<void>{try{const payment=await getPayment(item.provider_payment_id);await saasTransaction(client=>applyPaymentLifecycle(client,item,payment,getBillingConfig()));}
catch(error){console.error('Payment reconciliation failed.',{paymentId:item.provider_payment_id,error});await saasQuery("UPDATE billing_payments SET reconcile_after=now()+interval '1 hour',reconciliation_attempts=reconciliation_attempts+1 WHERE provider_payment_id=$1",[item.provider_payment_id]).catch(()=>undefined);}}
async function claimRefundReconciliation():Promise<RefundReconciliation|undefined>{return saasTransaction(async client=>{const row=(await client.query<RefundReconciliation>(`SELECT provider_refund_id FROM billing_refunds WHERE reconcile_after<=now() AND status='pending' AND provider_refund_id IS NOT NULL ORDER BY reconcile_after FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
  if(row)await client.query("UPDATE billing_refunds SET reconcile_after=now()+interval '15 minutes' WHERE provider_refund_id=$1",[row.provider_refund_id]);return row;});}
async function reconcileRefund(item:RefundReconciliation):Promise<void>{try{const refund=await getRefund(item.provider_refund_id);const config=getBillingConfig();await saasTransaction(async client=>{await client.query(`UPDATE billing_refunds SET status=$2,provider_snapshot=$3,last_reconciled_at=now(),reconcile_after=CASE WHEN $2='pending' THEN now()+$4*interval '1 minute' END,
  reconciliation_attempts=reconciliation_attempts+1,updated_at=now() WHERE provider_refund_id=$1`,[refund.id,refund.status,JSON.stringify(refundSnapshot(refund)),config.reconciliationMinutes]);await applyRefundLifecycle(client,refund);});}
catch(error){console.error('Refund reconciliation failed.',{refundId:item.provider_refund_id,error});await saasQuery("UPDATE billing_refunds SET reconcile_after=now()+interval '1 hour',reconciliation_attempts=reconciliation_attempts+1 WHERE provider_refund_id=$1",[item.provider_refund_id]).catch(()=>undefined);}}
async function expireGracePeriods():Promise<void>{await saasQuery(`UPDATE subscriptions SET plan='FREE',status='CANCELLED',auto_renew=false,next_billing_at=NULL,updated_at=now()
  WHERE status='PAST_DUE' AND grace_period_end<=now()`);}

async function leader(client:PoolClient):Promise<void>{
  console.log('Billing renewal leader started.');
  while(!stopping){await expireGracePeriods();const refund=await claimRefundReconciliation();if(refund)await reconcileRefund(refund);else{const pending=await claimReconciliation();if(pending)await reconcile(pending);else{const item=await claimRenewal();if(item)await renew(item);else await new Promise(resolve=>setTimeout(resolve,interval));}}}
  await client.query("SELECT pg_advisory_unlock(hashtext('tonatiuh-billing-renewals'))");
}

async function main():Promise<void>{while(!stopping){const client=await getSaasPool().connect();try{
  const lock=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext('tonatiuh-billing-renewals')) locked");if(lock.rows[0].locked)await leader(client);
}finally{client.release();}if(!stopping)await new Promise(resolve=>setTimeout(resolve,5000));}await getSaasPool().end();}
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
if(require.main===module)void main().catch(error=>{console.error('Billing worker failed.',error);process.exitCode=1;});
export{claimRenewal,renew,claimReconciliation,reconcile,claimRefundReconciliation,reconcileRefund,expireGracePeriods};
