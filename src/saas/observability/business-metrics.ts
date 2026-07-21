import { Gauge, Registry } from 'prom-client';
import { saasQuery } from '../db/pool';

type CountRow={status:string;count:number};
const bounded=async(gauge:Gauge<string>,query:string,label:string)=>{const result=await saasQuery<CountRow>(query);gauge.reset();for(const row of result.rows)gauge.set({[label]:row.status},Number(row.count));};

export function registerBusinessMetrics(registry:Registry):void{
  const bots=new Gauge({name:'tonatiuh_bots',help:'Bots by actual state',labelNames:['state'],registers:[registry],async collect(){await bounded(this,'SELECT actual_state status,count(*)::int count FROM trading_bots GROUP BY actual_state','state');}});
  void bots;
  const commands=new Gauge({name:'tonatiuh_bot_commands',help:'Bot commands by status',labelNames:['status'],registers:[registry],async collect(){await bounded(this,'SELECT status,count(*)::int count FROM bot_commands GROUP BY status','status');}});void commands;
  const emails=new Gauge({name:'tonatiuh_email_outbox',help:'Email outbox messages by status',labelNames:['status'],registers:[registry],async collect(){await bounded(this,'SELECT status,count(*)::int count FROM email_outbox GROUP BY status','status');}});void emails;
  const subscriptions=new Gauge({name:'tonatiuh_subscriptions',help:'Subscriptions by status',labelNames:['status'],registers:[registry],async collect(){await bounded(this,'SELECT status,count(*)::int count FROM subscriptions GROUP BY status','status');}});void subscriptions;
  const payments=new Gauge({name:'tonatiuh_payments_last_hour',help:'Payments created in the last hour by status',labelNames:['status'],registers:[registry],async collect(){await bounded(this,"SELECT status,count(*)::int count FROM billing_payments WHERE created_at>now()-interval '1 hour' GROUP BY status",'status');}});void payments;
  new Gauge({name:'tonatiuh_oldest_pending_command_age_seconds',help:'Age of the oldest pending bot command',registers:[registry],async collect(){const row=(await saasQuery<{age:number}>("SELECT COALESCE(EXTRACT(epoch FROM now()-min(created_at)),0)::float age FROM bot_commands WHERE status='PENDING'")).rows[0];this.set(Number(row?.age??0));}});
  new Gauge({name:'tonatiuh_oldest_pending_email_age_seconds',help:'Age of the oldest pending email',registers:[registry],async collect(){const row=(await saasQuery<{age:number}>("SELECT COALESCE(EXTRACT(epoch FROM now()-min(created_at)),0)::float age FROM email_outbox WHERE status='PENDING'")).rows[0];this.set(Number(row?.age??0));}});
  new Gauge({name:'tonatiuh_oldest_bot_heartbeat_age_seconds',help:'Age of the oldest running bot heartbeat',registers:[registry],async collect(){const row=(await saasQuery<{age:number}>("SELECT COALESCE(EXTRACT(epoch FROM now()-min(heartbeat_at)),0)::float age FROM trading_bots WHERE actual_state='RUNNING'")).rows[0];this.set(Number(row?.age??0));}});
  new Gauge({name:'tonatiuh_overdue_account_deletions',help:'Account deletions past their scheduled anonymization time',registers:[registry],async collect(){const row=(await saasQuery<{count:number}>("SELECT count(*)::int count FROM users WHERE status='DELETION_PENDING' AND scheduled_deletion_at<now()-interval '1 hour'")).rows[0];this.set(Number(row?.count??0));}});
}
