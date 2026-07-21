import nodemailer from 'nodemailer';
import { EncryptionService } from '../../plugins/EncryptionService/EncryptionService';
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { getSaasPool, saasQuery, saasTransaction } from '../db/pool';

type Outbox={id:string;recipient:string;template:'VERIFY_EMAIL'|'RESET_PASSWORD'|'INVITE_MEMBER';encrypted_payload:string;attempts:number};
const required=(name:string)=>{const value=optionalEnvConfig(name);if(!value)throw new Error(`${name} is required.`);return value;};
const port=Number(optionalEnvConfig('SMTP_PORT')??587);const interval=Number(optionalEnvConfig('EMAIL_WORKER_INTERVAL_MS')??5000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SMTP_PORT is invalid.');
if(!Number.isInteger(interval)||interval<1000||interval>300000)throw new Error('EMAIL_WORKER_INTERVAL_MS is invalid.');
const transport=nodemailer.createTransport({host:required('SMTP_HOST'),port,secure:optionalEnvConfig('SMTP_SECURE')==='true',
  auth:{user:required('SMTP_USER'),pass:required('SMTP_PASSWORD')},disableFileAccess:true,disableUrlAccess:true});
let stopping=false;
async function claim():Promise<Outbox|undefined>{return saasTransaction(async(client)=>{const row=(await client.query<Outbox>(`SELECT id,recipient,template,encrypted_payload,attempts
  FROM email_outbox WHERE status='PENDING' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
  if(row)await client.query("UPDATE email_outbox SET status='PROCESSING',attempts=attempts+1 WHERE id=$1",[row.id]);return row;});}
async function send(item:Outbox):Promise<void>{try{const payload=JSON.parse(new EncryptionService().decrypt(item.encrypted_payload)) as {token:string};
  const base=new URL(required('PUBLIC_APP_URL'));base.pathname=item.template==='VERIFY_EMAIL'?'/verify-email':item.template==='RESET_PASSWORD'?'/reset-password':'/invitations/accept';base.searchParams.set('token',payload.token);
  const subject=item.template==='VERIFY_EMAIL'?'Verify your Tonatiuh email':item.template==='RESET_PASSWORD'?'Reset your Tonatiuh password':'You were invited to a Tonatiuh workspace';
  await transport.sendMail({from:required('SMTP_FROM'),to:item.recipient,subject,text:`${subject}: ${base.toString()}`});
  await saasQuery("UPDATE email_outbox SET status='SENT',sent_at=now(),last_error=NULL WHERE id=$1",[item.id]);
}catch(error){const message=error instanceof Error?error.message:String(error);const delay=Math.min(3600,30*2**item.attempts);
  await saasQuery(`UPDATE email_outbox SET status=CASE WHEN attempts>=8 THEN 'FAILED' ELSE 'PENDING' END,
    next_attempt_at=now()+make_interval(secs=>$2),last_error=$3 WHERE id=$1`,[item.id,delay,message.slice(0,1000)]);}}
async function main():Promise<void>{await transport.verify();while(!stopping){const item=await claim();if(item)await send(item);else await new Promise(resolve=>setTimeout(resolve,interval));}await getSaasPool().end();}
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
void main().catch(error=>{console.error('Email worker failed.',error);process.exitCode=1;});
