import { getSaasPool } from '../db/pool';

async function main():Promise<void>{const email=process.argv[2]?.trim().toLowerCase();const role=process.argv[3];
  if(!email||!['ADMIN','USER'].includes(role))throw new Error('Usage: npm run admin:set-role -- <email> <ADMIN|USER>');
  if(role==='USER'){const current=await getSaasPool().query("SELECT platform_role FROM users WHERE email=$1",[email]);
    if(current.rows[0]?.platform_role==='ADMIN'){const admins=await getSaasPool().query("SELECT count(*)::int count FROM users WHERE platform_role='ADMIN' AND status='ACTIVE'");if(admins.rows[0].count<=1)throw new Error('Cannot demote the last active platform administrator.');}}
  const result=await getSaasPool().query('UPDATE users SET platform_role=$2,updated_at=now() WHERE email=$1 RETURNING id,email,platform_role',[email,role]);
  if(!result.rowCount)throw new Error('User was not found.');console.log(`Platform role for ${email} changed to ${role}.`);await getSaasPool().end();}
void main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
