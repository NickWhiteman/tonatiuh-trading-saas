import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { setProcessDatabaseScope } from '../db/access-context';
import { getSaasPool, saasQuery, saasTransaction } from '../db/pool';
import { logger } from '../observability/logger';

setProcessDatabaseScope('service');
const interval=Number(optionalEnvConfig('RETENTION_WORKER_INTERVAL_MS')??86_400_000);
if(!Number.isInteger(interval)||interval<60_000||interval>604_800_000)throw new Error('RETENTION_WORKER_INTERVAL_MS must be between one minute and seven days.');
let stopping=false;

async function anonymizeOne():Promise<boolean>{return saasTransaction(async client=>{const user=(await client.query<{id:string;email:string}>(`SELECT id,email FROM users
  WHERE status='DELETION_PENDING' AND scheduled_deletion_at<=now() ORDER BY scheduled_deletion_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];if(!user)return false;
  const owned=(await client.query<{organization_id:string}>(`SELECT organization_id FROM organization_memberships owner WHERE user_id=$1 AND role='OWNER'
    AND NOT EXISTS(SELECT 1 FROM organization_memberships other WHERE other.organization_id=owner.organization_id AND other.user_id<>owner.user_id)`,[user.id])).rows;
  for(const row of owned){await client.query('DELETE FROM orders WHERE organization_id=$1',[row.organization_id]);await client.query('DELETE FROM trading_sessions WHERE organization_id=$1',[row.organization_id]);
    await client.query('DELETE FROM bot_commands WHERE organization_id=$1',[row.organization_id]);await client.query('DELETE FROM trading_bots WHERE organization_id=$1',[row.organization_id]);await client.query('DELETE FROM exchange_connections WHERE organization_id=$1',[row.organization_id]);
    await client.query("UPDATE subscriptions SET payment_method_id=NULL,auto_renew=false,next_billing_at=NULL,cancel_at_period_end=true,updated_at=now() WHERE organization_id=$1",[row.organization_id]);
    await client.query("UPDATE billing_payments SET provider_snapshot='{}'::jsonb,updated_at=now() WHERE organization_id=$1",[row.organization_id]);
    await client.query("UPDATE organizations SET name='Deleted workspace',status='CLOSED',updated_at=now() WHERE id=$1",[row.organization_id]);}
  await client.query('DELETE FROM refresh_tokens WHERE user_id=$1',[user.id]);await client.query('DELETE FROM account_tokens WHERE user_id=$1',[user.id]);await client.query('DELETE FROM email_outbox WHERE recipient=$1',[user.email]);
  await client.query('DELETE FROM organization_memberships WHERE user_id=$1',[user.id]);
  await client.query(`UPDATE users SET email=('deleted+'||id||'@invalid.local')::citext,password_hash=NULL,display_name='Deleted user',status='DELETED',
    platform_role='USER',anonymized_at=now(),scheduled_deletion_at=NULL,updated_at=now() WHERE id=$1`,[user.id]);
  await client.query("UPDATE data_subject_requests SET status='COMPLETED',completed_at=now() WHERE user_id=$1 AND kind='DELETE' AND status='REQUESTED'",[user.id]);return true;});}

async function cleanup():Promise<void>{let anonymized=0;while(await anonymizeOne())anonymized++;
  const results=await Promise.all([
    saasQuery("DELETE FROM refresh_tokens WHERE expires_at<now()-interval '30 days' OR revoked_at<now()-interval '30 days'"),
    saasQuery("DELETE FROM account_tokens WHERE expires_at<now()-interval '7 days' OR consumed_at<now()-interval '30 days'"),
    saasQuery('DELETE FROM request_rate_limits WHERE expires_at<now()'),
    saasQuery("DELETE FROM email_outbox WHERE status='SENT' AND sent_at<now()-interval '30 days' OR status='FAILED' AND created_at<now()-interval '90 days'"),
    saasQuery("UPDATE billing_payments SET provider_snapshot='{}'::jsonb,updated_at=now() WHERE created_at<now()-interval '90 days' AND provider_snapshot<>'{}'::jsonb"),
    saasQuery("UPDATE audit_events SET ip_address=NULL,metadata='{}'::jsonb WHERE created_at<now()-interval '400 days' AND (ip_address IS NOT NULL OR metadata<>'{}'::jsonb)"),
    saasQuery("DELETE FROM data_subject_requests WHERE requested_at<now()-interval '6 years'"),
  ]);logger.info({anonymized,affectedRows:results.map(result=>result.rowCount)},'data retention cycle completed');}

async function main():Promise<void>{while(!stopping){const client=await getSaasPool().connect();try{const lock=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext('tonatiuh-retention-worker')) locked");
  if(lock.rows[0].locked){try{await cleanup();}finally{await client.query("SELECT pg_advisory_unlock(hashtext('tonatiuh-retention-worker'))");}}}finally{client.release();}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,interval));}await getSaasPool().end();}
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});void main().catch(error=>{logger.fatal({err:error},'retention worker failed');process.exitCode=1;});
