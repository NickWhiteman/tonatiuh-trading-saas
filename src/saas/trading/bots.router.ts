import { Router } from 'express';
import { saasQuery, saasTransaction } from '../db/pool';
import { authContext, requireRoles } from '../http/authorization';
import { notFound, SaasHttpError } from '../http/errors';
import { authenticate } from '../http/middleware';
import { objectValue, optionalStringValue, stringValue, uuidValue } from '../http/validate';
import { writeAuditEvent } from '../services/audit';
import { tradingConfiguration } from './configuration';
import { consumeBotCommand, enforceResourceQuota } from '../entitlements/service';

export const botsRouter=Router();
botsRouter.use(authenticate);

botsRouter.get('/',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(
  `SELECT b.id,b.name,b.strategy,b.configuration,b.desired_state,b.actual_state,b.last_error,b.heartbeat_at,b.started_at,b.created_at,b.updated_at,
   e.id exchange_connection_id,e.label exchange_connection_label,e.exchange_code,e.sandbox FROM trading_bots b JOIN exchange_connections e ON e.id=b.exchange_connection_id
   WHERE b.organization_id=$1 ORDER BY b.created_at DESC`,[auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});

botsRouter.get('/:id',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const result=await saasQuery(
  `SELECT b.id,b.name,b.strategy,b.configuration,b.desired_state,b.actual_state,b.last_error,b.heartbeat_at,b.started_at,b.created_at,b.updated_at,
   e.id exchange_connection_id,e.label exchange_connection_label,e.exchange_code,e.sandbox FROM trading_bots b JOIN exchange_connections e ON e.id=b.exchange_connection_id
   WHERE b.id=$1 AND b.organization_id=$2`,[id,auth.organizationId]);if(!result.rows[0])throw notFound('Bot was not found.');res.json(result.rows[0]);}catch(error){next(error);}});

botsRouter.post('/',requireRoles('OWNER','ADMIN','TRADER'),async(req,res,next)=>{try{const auth=authContext(req);
  const body=objectValue(req.body,['exchangeConnectionId','name','strategy','configuration']);const connectionId=uuidValue(body.exchangeConnectionId,'exchangeConnectionId');
  const strategy=body.strategy===undefined?'VECTOR_PROFIT':stringValue(body.strategy,'strategy',40);
  if(strategy!=='VECTOR_PROFIT')throw new SaasHttpError(400,'UNSUPPORTED_STRATEGY','Strategy is not supported.');
  const result=await saasTransaction(async client=>{await enforceResourceQuota(client,auth.organizationId,'bots');const connection=await client.query('SELECT 1 FROM exchange_connections WHERE id=$1 AND organization_id=$2 AND enabled=true',[connectionId,auth.organizationId]);
    if(!connection.rowCount)throw notFound('Enabled exchange connection was not found.');return client.query(`INSERT INTO trading_bots(organization_id,exchange_connection_id,name,strategy,configuration) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [auth.organizationId,connectionId,stringValue(body.name,'name',100),strategy,JSON.stringify(tradingConfiguration(body.configuration))]);});
  await writeAuditEvent(req,'BOT_CREATED','bot',String(result.rows[0].id));res.status(201).json(result.rows[0]);
}catch(error:unknown){const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;next(code==='23505'?new SaasHttpError(409,'BOT_NAME_EXISTS','Bot name already exists.'):error);}});

botsRouter.patch('/:id',requireRoles('OWNER','ADMIN','TRADER'),async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');
  const body=objectValue(req.body,['name','configuration']);const current=(await saasQuery<{actual_state:string;configuration:Record<string,unknown>}>(
    'SELECT actual_state,configuration FROM trading_bots WHERE id=$1 AND organization_id=$2',[id,auth.organizationId])).rows[0];if(!current)throw notFound('Bot was not found.');
  if(!['STOPPED','FAILED'].includes(current.actual_state))throw new SaasHttpError(409,'BOT_NOT_EDITABLE','Stop the bot before editing it.');
  const configuration=body.configuration===undefined?current.configuration:tradingConfiguration(body.configuration);
  const result=await saasQuery(`UPDATE trading_bots SET name=COALESCE($3,name),configuration=$4,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *`,
    [id,auth.organizationId,optionalStringValue(body.name,'name',100),JSON.stringify(configuration)]);await writeAuditEvent(req,'BOT_UPDATED','bot',id);res.json(result.rows[0]);
}catch(error){next(error);}});

for(const command of ['START','STOP','RESTART'] as const){botsRouter.post(`/:id/${command.toLowerCase()}`,
  requireRoles('OWNER','ADMIN','TRADER'),async(req,res,next)=>{try{
    const auth=authContext(req);const botId=uuidValue(req.params.id,'id');const key=String(req.header('idempotency-key')??'').trim();
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new SaasHttpError(400,'IDEMPOTENCY_KEY_REQUIRED','A valid Idempotency-Key header is required.');
    const result=await saasTransaction(async(client)=>{const bot=(await client.query<{actual_state:string}>(
      'SELECT actual_state FROM trading_bots WHERE id=$1 AND organization_id=$2 FOR UPDATE',[botId,auth.organizationId])).rows[0];if(!bot)throw notFound('Bot was not found.');
      const inserted=(await client.query(`INSERT INTO bot_commands(organization_id,bot_id,command,idempotency_key,requested_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING *`,[auth.organizationId,botId,command,key,auth.userId])).rows[0];
      if(inserted){if(command!=='STOP')await consumeBotCommand(client,auth.organizationId);const desired=command==='STOP'?'STOPPED':'RUNNING';const state=command==='STOP'?'STOPPING':'STARTING';
        await client.query('UPDATE trading_bots SET desired_state=$3,actual_state=$4,updated_at=now() WHERE id=$1 AND organization_id=$2',[botId,auth.organizationId,desired,state]);return inserted;}
      const existing=(await client.query<{bot_id:string;command:string}>(
        'SELECT * FROM bot_commands WHERE organization_id=$1 AND idempotency_key=$2',[auth.organizationId,key])).rows[0];
      if(existing.bot_id!==botId||existing.command!==command)throw new SaasHttpError(409,'IDEMPOTENCY_KEY_CONFLICT','Idempotency key was used for another command.');return existing;
    });await writeAuditEvent(req,`BOT_${command}_REQUESTED`,'bot',botId);res.status(202).json(result);
  }catch(error){next(error);}});}

botsRouter.get('/:id/commands',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const result=await saasQuery(
  'SELECT id,command,status,error,created_at,processed_at FROM bot_commands WHERE bot_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100',[id,auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});
botsRouter.get('/:id/orders',async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');const result=await saasQuery(
  'SELECT id,exchange_order_id,client_order_id,symbol,side,order_type,status,quantity,price,created_at,updated_at FROM orders WHERE bot_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 200',[id,auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});
