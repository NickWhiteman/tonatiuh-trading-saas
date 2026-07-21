import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { EncryptionService } from '../../plugins/EncryptionService/EncryptionService';
import { defaultEmailLocale } from '../email/delivery';

export type AccountTokenKind='VERIFY_EMAIL'|'RESET_PASSWORD';
export const hashAccountToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function queueAccountEmail(client:PoolClient,input:{userId:string;email:string;kind:AccountTokenKind}):Promise<void>{
  const token=randomBytes(32).toString('base64url');const ttl=input.kind==='VERIFY_EMAIL'?'24 hours':'1 hour';
  await client.query('UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND kind=$2 AND consumed_at IS NULL',[input.userId,input.kind]);
  await client.query(`INSERT INTO account_tokens(user_id,kind,token_hash,expires_at) VALUES($1,$2,$3,now()+$4::interval)`,
    [input.userId,input.kind,hashAccountToken(token),ttl]);
  const encrypted=new EncryptionService().encrypt(JSON.stringify({token}));
  await client.query('INSERT INTO email_outbox(recipient,template,encrypted_payload,locale) VALUES($1,$2,$3,$4)',[input.email,input.kind,encrypted,defaultEmailLocale()]);
}
