import { PoolClient } from 'pg';
import { SaasHttpError } from '../http/errors';
import { Entitlements, PlanId, planCatalog } from './catalog';
import { recordQuotaDenial } from '../observability/application-metrics';

export async function activePlan(client:PoolClient,organizationId:string):Promise<PlanId>{const row=(await client.query<{plan:string}>(`SELECT plan FROM subscriptions
  WHERE organization_id=$1 AND status IN ('ACTIVE','PAST_DUE') AND (current_period_end>now() OR grace_period_end>now())`,[organizationId])).rows[0];return row?.plan==='PRO'?'PRO':'FREE';}
async function lock(client:PoolClient,organizationId:string,resource:string){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${organizationId}:${resource}`]);}
const exceeded=(resource:string,plan:PlanId,limit:number,current:number)=>{recordQuotaDenial(resource,plan);return new SaasHttpError(409,'QUOTA_EXCEEDED',`${resource} quota is exceeded.`,{resource,plan,limit,current});};

export async function enforceResourceQuota(client:PoolClient,organizationId:string,resource:'exchangeConnections'|'bots'):Promise<{plan:PlanId;entitlements:Entitlements}>{await lock(client,organizationId,resource);const plan=await activePlan(client,organizationId);const entitlements=planCatalog[plan];
  const table=resource==='bots'?'trading_bots':'exchange_connections';const limit=resource==='bots'?entitlements.maxBots:entitlements.maxExchangeConnections;
  const current=Number((await client.query<{count:number}>(`SELECT count(*)::int count FROM ${table} WHERE organization_id=$1`,[organizationId])).rows[0].count);if(current>=limit)throw exceeded(resource,plan,limit,current);return{plan,entitlements};}

export async function enforceMemberQuota(client:PoolClient,organizationId:string):Promise<void>{await lock(client,organizationId,'members');const plan=await activePlan(client,organizationId);const limit=planCatalog[plan].maxMembers;
  const current=Number((await client.query<{count:number}>(`SELECT (SELECT count(*) FROM organization_memberships WHERE organization_id=$1)+
    (SELECT count(*) FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) count`,[organizationId])).rows[0].count);
  if(current>=limit)throw exceeded('members',plan,limit,current);}

export async function consumeBotCommand(client:PoolClient,organizationId:string):Promise<void>{await lock(client,organizationId,'botCommands');const plan=await activePlan(client,organizationId);const entitlements=planCatalog[plan];
  if(!entitlements.liveTrading){recordQuotaDenial('liveTrading',plan);throw new SaasHttpError(402,'ENTITLEMENT_REQUIRED','Live trading is not included in the current plan.',{feature:'liveTrading',plan});}
  const row=(await client.query<{quantity:string}>(`INSERT INTO organization_usage_monthly(organization_id,period_start,metric,quantity) VALUES($1,date_trunc('month',now())::date,'BOT_COMMANDS',1)
    ON CONFLICT(organization_id,period_start,metric) DO UPDATE SET quantity=organization_usage_monthly.quantity+1,updated_at=now() RETURNING quantity`,[organizationId])).rows[0];
  const quantity=Number(row.quantity);if(quantity>entitlements.monthlyBotCommands)throw exceeded('monthlyBotCommands',plan,entitlements.monthlyBotCommands,quantity-1);}
