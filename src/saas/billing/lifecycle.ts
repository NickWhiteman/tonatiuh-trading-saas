import {PoolClient} from 'pg';
import {BillingConfig} from './config';
import {YooPayment,YooRefund} from './yookassa';

export type LocalPayment={organization_id:string;provider_payment_id:string;kind:'INITIAL'|'RENEWAL';attempt_number:number};
export const paymentSnapshot=(payment:YooPayment)=>({id:payment.id,status:payment.status,paid:payment.paid===true,amount:payment.amount,
  paymentMethodSaved:payment.payment_method?.saved===true,metadata:payment.metadata,cancellationDetails:payment.cancellation_details});
export const refundSnapshot=(refund:YooRefund)=>({id:refund.id,paymentId:refund.payment_id,status:refund.status,amount:refund.amount,cancellationDetails:refund.cancellation_details});
export function retryDelayHours(attempt:number,schedule:number[]):number|undefined{return schedule[attempt-1];}

export async function applyPaymentLifecycle(client:PoolClient,local:LocalPayment,payment:YooPayment,config:BillingConfig):Promise<void>{const stored=JSON.stringify(paymentSnapshot(payment));
  await client.query(`UPDATE billing_payments SET status=$2,provider_snapshot=$3,last_reconciled_at=now(),reconcile_after=CASE WHEN $2 IN ('pending','waiting_for_capture') THEN now()+$4*interval '1 minute' END,
    reconciliation_attempts=CASE WHEN $2 IN ('pending','waiting_for_capture') THEN reconciliation_attempts+1 ELSE reconciliation_attempts END,updated_at=now() WHERE provider_payment_id=$1`,[payment.id,payment.status,stored,config.reconciliationMinutes]);
  if(payment.status==='succeeded'&&payment.paid===true){const applied=await client.query('UPDATE billing_payments SET entitlement_applied_at=now() WHERE provider_payment_id=$1 AND entitlement_applied_at IS NULL RETURNING id',[payment.id]);if(!applied.rowCount)return;
    const method=payment.payment_method?.saved===true?payment.payment_method.id:null;await client.query(`INSERT INTO subscriptions(organization_id,plan,status,current_period_end,payment_method_id,auto_renew,next_billing_at,last_payment_id)
      VALUES($1,'PRO','ACTIVE',now()+interval '1 month',$3,$3 IS NOT NULL,CASE WHEN $3 IS NOT NULL THEN now()+interval '1 month' END,$2)
      ON CONFLICT(organization_id) DO UPDATE SET plan='PRO',status='ACTIVE',current_period_end=GREATEST(COALESCE(subscriptions.current_period_end,now()),now())+interval '1 month',
      payment_method_id=COALESCE($3,subscriptions.payment_method_id),auto_renew=CASE WHEN $3 IS NULL THEN subscriptions.auto_renew ELSE true END,
      next_billing_at=CASE WHEN COALESCE($3,subscriptions.payment_method_id) IS NULL THEN NULL ELSE GREATEST(COALESCE(subscriptions.current_period_end,now()),now())+interval '1 month' END,
      cancel_at_period_end=false,last_payment_id=$2,grace_period_end=NULL,retry_count=0,last_billing_error_code=NULL,updated_at=now()`,[local.organization_id,payment.id,method]);return;}
  if(payment.status!=='canceled'||local.kind!=='RENEWAL')return;const applied=await client.query('UPDATE billing_payments SET failure_applied_at=now() WHERE provider_payment_id=$1 AND failure_applied_at IS NULL RETURNING id',[payment.id]);if(!applied.rowCount)return;
  const reason=payment.cancellation_details?.reason??'payment_canceled';const revoked=reason==='permission_revoked';const delay=revoked?undefined:retryDelayHours(local.attempt_number,config.retryScheduleHours);
  await client.query(`UPDATE subscriptions SET status=CASE WHEN $2::int IS NULL OR now()+($2*interval '1 hour')>=COALESCE(grace_period_end,current_period_end+($3*interval '1 day'),now()) THEN 'CANCELLED' ELSE 'PAST_DUE' END,
    plan=CASE WHEN $2::int IS NULL OR now()+($2*interval '1 hour')>=COALESCE(grace_period_end,current_period_end+($3*interval '1 day'),now()) THEN 'FREE' ELSE plan END,
    grace_period_end=COALESCE(grace_period_end,current_period_end+($3*interval '1 day'),now()+($3*interval '1 day')),retry_count=GREATEST(retry_count,$4),
    next_billing_at=CASE WHEN $2::int IS NULL OR now()+($2*interval '1 hour')>=COALESCE(grace_period_end,current_period_end+($3*interval '1 day'),now()) THEN NULL ELSE now()+($2*interval '1 hour') END,
    auto_renew=CASE WHEN $2::int IS NULL OR now()+($2*interval '1 hour')>=COALESCE(grace_period_end,current_period_end+($3*interval '1 day'),now()) THEN false ELSE auto_renew END,payment_method_id=CASE WHEN $5 THEN NULL ELSE payment_method_id END,
    last_billing_error_code=$6,updated_at=now() WHERE organization_id=$1`,[local.organization_id,delay??null,config.gracePeriodDays,local.attempt_number,revoked,reason]);
}

export async function applyRefundLifecycle(client:PoolClient,refund:YooRefund):Promise<void>{if(refund.status!=='succeeded')return;const applied=await client.query('UPDATE billing_refunds SET lifecycle_applied_at=now() WHERE provider_refund_id=$1 AND lifecycle_applied_at IS NULL RETURNING provider_payment_id',[refund.id]);if(!applied.rowCount)return;
  await client.query(`UPDATE subscriptions s SET plan='FREE',status='CANCELLED',current_period_end=now(),grace_period_end=NULL,auto_renew=false,next_billing_at=NULL,cancel_at_period_end=true,updated_at=now()
    WHERE s.last_payment_id=$1 AND EXISTS(SELECT 1 FROM billing_refunds r JOIN billing_payments p ON p.provider_payment_id=r.provider_payment_id WHERE r.provider_refund_id=$2 AND r.amount_kopecks=p.amount_kopecks)`,[refund.payment_id,refund.id]);
}
