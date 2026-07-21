'use strict';

const PLACEHOLDER=/example\.(com|test)|replace-with|changeme|placeholder/i;
const HEX64=/^[a-f0-9]{64}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;

function required(env,name,errors){const value=(env[name]??'').trim();if(!value)errors.push(`${name} is required`);else if(PLACEHOLDER.test(value))errors.push(`${name} contains a placeholder`);return value;}
function httpsUrl(env,name,errors){const value=required(env,name,errors);if(value){try{if(new URL(value).protocol!=='https:')errors.push(`${name} must use HTTPS`);}catch{errors.push(`${name} must be a valid URL`);}}return value;}

function evaluateProductionReadiness(env=process.env,now=new Date()){
  const errors=[];const checks=[];
  const expect=(condition,message)=>{checks.push({name:message,passed:Boolean(condition)});if(!condition)errors.push(message);};
  expect(env.ENV_RELEASE==='prod','ENV_RELEASE must equal prod');
  expect(env.APP_MODE==='web','APP_MODE must equal web');
  const domain=required(env,'DOMAIN',errors);expect(Boolean(domain&&!PLACEHOLDER.test(domain)&&/^[a-z0-9.-]+$/i.test(domain)),'DOMAIN must be a production hostname');
  for(const name of ['PUBLIC_APP_URL','TERMS_URL','PRIVACY_URL','YOOKASSA_RETURN_URL'])httpsUrl(env,name,errors);
  const cors=required(env,'CORS_ORIGINS',errors);expect(Boolean(cors&&cors.split(',').every(value=>{try{return new URL(value.trim()).protocol==='https:';}catch{return false;}})),'every CORS_ORIGINS value must use HTTPS');
  for(const name of ['TERMS_SHA256','PRIVACY_SHA256'])expect(HEX64.test((env[name]??'').trim()),`${name} must be a lowercase SHA-256 digest`);
  required(env,'CONSENT_EVIDENCE_KEY_ID',errors);
  const commit=required(env,'RELEASE_COMMIT_SHA',errors);expect(/^[a-f0-9]{40}$/.test(commit),'RELEASE_COMMIT_SHA must be a full Git commit SHA');
  const image=required(env,'IMAGE_DIGEST',errors);expect(DIGEST.test(image),'IMAGE_DIGEST must be an immutable sha256 digest');
  const imageReference=required(env,'IMAGE_REFERENCE',errors);expect(Boolean(image&&imageReference.endsWith(`@${image}`)),'IMAGE_REFERENCE must pin the release IMAGE_DIGEST');
  const toolsReference=required(env,'POSTGRES_TOOLS_REFERENCE',errors);expect(/@sha256:[a-f0-9]{64}$/.test(toolsReference),'POSTGRES_TOOLS_REFERENCE must pin an immutable digest');
  const previous=required(env,'PREVIOUS_IMAGE_DIGEST',errors);expect(DIGEST.test(previous),'PREVIOUS_IMAGE_DIGEST must identify the rollback image');expect(Boolean(image&&previous&&image!==previous),'rollback image must differ from the release image');
  const drill=required(env,'RESTORE_DRILL_AT',errors);const drillAt=new Date(drill);const age=now.getTime()-drillAt.getTime();expect(Number.isFinite(drillAt.getTime())&&age>=0&&age<=8*24*60*60*1000,'RESTORE_DRILL_AT must be a successful drill from the last 8 days');
  for(const name of ['MIGRATION_REVIEWED_BY','SECURITY_REVIEWED_BY','ON_CALL_OWNER','CHANGE_TICKET_URL'])required(env,name,errors);
  if(env.CHANGE_TICKET_URL)httpsUrl(env,'CHANGE_TICKET_URL',errors);
  return{ready:errors.length===0,checkedAt:now.toISOString(),releaseCommit:commit||null,imageDigest:image||null,checks,errors:[...new Set(errors)]};
}

module.exports={evaluateProductionReadiness};
