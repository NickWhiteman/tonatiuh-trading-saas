import ccxt, { Exchange } from 'ccxt';
import { Router } from 'express';
import { EncryptionService } from '../../plugins/EncryptionService/EncryptionService';
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { saasQuery, saasTransaction } from '../db/pool';
import { authContext, requireRoles } from '../http/authorization';
import { notFound, SaasHttpError } from '../http/errors';
import { authenticate } from '../http/middleware';
import { booleanValue, objectValue, optionalStringValue, stringValue, uuidValue } from '../http/validate';
import { writeAuditEvent } from '../services/audit';
import { enforceResourceQuota } from '../entitlements/service';
import {requireCurrentLegalConsent} from '../compliance/service';

export const exchangesRouter=Router();
const supported=['okx','binance','bitget','kucoin','mexc','poloniex','gate','exmo','bybit'];
type Credentials={apiKey:string;privateKey:string;password:string};
const encrypt=(credentials:Credentials)=>new EncryptionService().encrypt(JSON.stringify(credentials));
const credentialsFrom=(body:Record<string,unknown>):Credentials=>({apiKey:stringValue(body.apiKey,'apiKey',512),
  privateKey:stringValue(body.secret,'secret',512),password:optionalStringValue(body.password,'password',512)??''});

async function verify(exchangeCode:string,credentials:Credentials,sandbox:boolean):Promise<void>{
  const Constructor=(ccxt as unknown as Record<string,new(config:Record<string,unknown>)=>Exchange>)[exchangeCode];
  if(!Constructor)throw new SaasHttpError(400,'UNSUPPORTED_EXCHANGE','Exchange is not supported.');
  const exchange=new Constructor({apiKey:credentials.apiKey,secret:credentials.privateKey,password:credentials.password,timeout:10_000,enableRateLimit:true});
  try{if(sandbox)exchange.setSandboxMode(true);await exchange.fetchBalance();}
  catch(error){console.error('Exchange verification failed.',{exchangeCode,error});throw new SaasHttpError(422,'EXCHANGE_VERIFICATION_FAILED','Exchange credentials could not be verified.');}
  finally{await exchange.close().catch(()=>undefined);}
}

exchangesRouter.use(authenticate);
exchangesRouter.get('/',async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(
  `SELECT id,exchange_code,label,enabled,sandbox,last_verified_at,created_at,updated_at FROM exchange_connections
   WHERE organization_id=$1 ORDER BY created_at DESC`,[auth.organizationId]);res.json({items:result.rows});}catch(error){next(error);}});

exchangesRouter.post('/',requireRoles('OWNER','ADMIN'),requireCurrentLegalConsent,async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,
  ['exchange','label','apiKey','secret','password','sandbox','verify']);const exchange=stringValue(body.exchange,'exchange',30).toLowerCase();
  if(!supported.includes(exchange))throw new SaasHttpError(400,'UNSUPPORTED_EXCHANGE','Exchange is not supported.');
  const sandbox=body.sandbox===undefined?false:booleanValue(body.sandbox,'sandbox');const shouldVerify=body.verify===undefined?false:booleanValue(body.verify,'verify');const credentials=credentialsFrom(body);
  if(shouldVerify)await verify(exchange,credentials,sandbox);
  const result=await saasTransaction(async client=>{await enforceResourceQuota(client,auth.organizationId,'exchangeConnections');return client.query(`INSERT INTO exchange_connections(organization_id,exchange_code,label,credentials_ciphertext,encryption_key_id,sandbox,last_verified_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() END) RETURNING id,exchange_code,label,enabled,sandbox,last_verified_at,created_at`,
    [auth.organizationId,exchange,stringValue(body.label,'label',100),encrypt(credentials),optionalEnvConfig('ENCRYPTION_KEY_ID')??'primary-v1',sandbox,shouldVerify]);});
  await writeAuditEvent(req,'EXCHANGE_CONNECTION_CREATED','exchange_connection',String(result.rows[0].id),{exchange,sandbox});res.status(201).json(result.rows[0]);
}catch(error:unknown){const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;next(code==='23505'?new SaasHttpError(409,'LABEL_EXISTS','Connection label already exists.'):error);}});

exchangesRouter.post('/:id/verify',requireRoles('OWNER','ADMIN'),requireCurrentLegalConsent,async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');
  const result=await saasQuery<{exchange_code:string;credentials_ciphertext:string;sandbox:boolean}>(
    'SELECT exchange_code,credentials_ciphertext,sandbox FROM exchange_connections WHERE id=$1 AND organization_id=$2',[id,auth.organizationId]);
  const row=result.rows[0];if(!row)throw notFound('Exchange connection was not found.');
  const credentials=JSON.parse(new EncryptionService().decrypt(row.credentials_ciphertext)) as Credentials;await verify(row.exchange_code,credentials,row.sandbox);
  await saasQuery('UPDATE exchange_connections SET last_verified_at=now(),updated_at=now() WHERE id=$1',[id]);await writeAuditEvent(req,'EXCHANGE_CONNECTION_VERIFIED','exchange_connection',id);res.json({verified:true});
}catch(error){next(error);}});

exchangesRouter.patch('/:id',requireRoles('OWNER','ADMIN'),requireCurrentLegalConsent,async(req,res,next)=>{try{const auth=authContext(req);const id=uuidValue(req.params.id,'id');
  const body=objectValue(req.body,['label','enabled','apiKey','secret','password']);const current=(await saasQuery<{credentials_ciphertext:string}>(
    'SELECT credentials_ciphertext FROM exchange_connections WHERE id=$1 AND organization_id=$2',[id,auth.organizationId])).rows[0];if(!current)throw notFound();
  const changesCredentials=body.apiKey!==undefined||body.secret!==undefined||body.password!==undefined;
  const old=JSON.parse(new EncryptionService().decrypt(current.credentials_ciphertext)) as Credentials;
  const credentials=changesCredentials?{apiKey:optionalStringValue(body.apiKey,'apiKey',512)??old.apiKey,
    privateKey:optionalStringValue(body.secret,'secret',512)??old.privateKey,password:optionalStringValue(body.password,'password',512)??old.password}:old;
  const result=await saasQuery(`UPDATE exchange_connections SET label=COALESCE($3,label),enabled=COALESCE($4,enabled),credentials_ciphertext=$5,
    encryption_key_id=$6,last_verified_at=CASE WHEN $7 THEN NULL ELSE last_verified_at END,updated_at=now() WHERE id=$1 AND organization_id=$2
    RETURNING id,exchange_code,label,enabled,sandbox,last_verified_at,updated_at`,[id,auth.organizationId,optionalStringValue(body.label,'label',100),
      body.enabled===undefined?undefined:booleanValue(body.enabled,'enabled'),encrypt(credentials),optionalEnvConfig('ENCRYPTION_KEY_ID')??'primary-v1',changesCredentials]);
  await writeAuditEvent(req,'EXCHANGE_CONNECTION_UPDATED','exchange_connection',id,{credentialsChanged:changesCredentials});res.json(result.rows[0]);
}catch(error){next(error);}});
