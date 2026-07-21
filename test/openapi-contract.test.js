const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { describe, it } = require('node:test');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { parse } = require('yaml');

const contractPath = 'docs/openapi.yaml';
const unversionedExpected = {
  '/api/auth/register':['post'], '/api/auth/login':['post'], '/api/auth/refresh':['post'], '/api/auth/logout':['post'],
  '/api/auth/verify-email':['post'], '/api/auth/resend-verification':['post'], '/api/auth/forgot-password':['post'],
  '/api/auth/reset-password':['post'], '/api/auth/me':['delete','get'], '/api/billing/plans':['get'], '/api/billing/webhook':['post'],
  '/api/auth/cancel-deletion':['post'], '/api/auth/me/export':['get'],
  '/api/billing/subscription':['get'], '/api/billing/usage':['get'], '/api/billing/checkout':['post'], '/api/billing/cancel':['post'], '/api/billing/resume':['post'],
  '/api/exchanges':['get','post'], '/api/exchanges/{id}':['patch'], '/api/exchanges/{id}/verify':['post'],
  '/api/organizations':['get'], '/api/organizations/switch':['post'], '/api/organizations/members':['get'],
  '/api/organizations/members/{userId}':['delete','patch'], '/api/organizations/invitations':['get','post'],
  '/api/organizations/invitations/accept':['post'], '/api/organizations/invitations/{id}':['delete'],
  '/api/bots':['get','post'], '/api/bots/{id}':['get','patch'], '/api/bots/{id}/start':['post'], '/api/bots/{id}/stop':['post'],
  '/api/bots/{id}/restart':['post'], '/api/bots/{id}/commands':['get'], '/api/bots/{id}/orders':['get'],
  '/health/live':['get'], '/health/ready':['get'], '/metrics':['get'],
  '/api/admin/stats':['get'], '/api/admin/users':['get'], '/api/admin/users/{id}/status':['patch'],
  '/api/admin/users/{id}/revoke-sessions':['post'], '/api/admin/organizations':['get'],
  '/api/admin/organizations/{id}/status':['patch'], '/api/admin/audit-events':['get'], '/api/admin/payments':['get'], '/api/admin/system':['get'],
  '/api/email/provider-events':['post'], '/api/admin/email/dead-letters':['get'], '/api/admin/email/dead-letters/{id}/retry':['post'],
};
const expected=Object.fromEntries(Object.entries(unversionedExpected).map(([path,methods])=>[path.replace('/api/','/api/v1/'),methods]));
const publicOperations=new Set(['register','login','refreshSession','logout','verifyEmail','resendVerification','forgotPassword',
  'resetPassword','cancelAccountDeletion','listPlans','yookassaWebhook','liveness','readiness']);

async function contract(){return parse(await readFile(contractPath,'utf8'));}
describe('OpenAPI contract',()=>{
  it('is a valid OpenAPI 3.1 document',async()=>{const api=await SwaggerParser.validate(contractPath);assert.equal(api.openapi,'3.1.0');});
  it('documents the complete public route inventory',async()=>{const api=await contract();const actual={};
    for(const [path,item] of Object.entries(api.paths))actual[path]=Object.keys(item).filter(key=>['get','post','put','patch','delete'].includes(key)).sort();
    assert.deepEqual(actual,Object.fromEntries(Object.entries(expected).map(([path,methods])=>[path,[...methods].sort()])));});
  it('has unique operation IDs and explicit public security overrides',async()=>{const api=await contract();const ids=[];
    for(const item of Object.values(api.paths))for(const operation of Object.values(item)){if(!operation?.operationId)continue;ids.push(operation.operationId);
      if(publicOperations.has(operation.operationId))assert.deepEqual(operation.security,[],`${operation.operationId} must be public`);
      else if(operation.operationId==='emailProviderEvent')assert.deepEqual(operation.security,[{emailWebhookToken:[]}]);
      else if(operation.operationId==='prometheusMetrics')assert.deepEqual(operation.security,[{metricsToken:[]}]);
      else assert.deepEqual(operation.security??api.security,[{bearerAuth:[]}],`${operation.operationId} must require Bearer auth`);}
    assert.equal(new Set(ids).size,ids.length);});
  it('requires idempotency keys for money and bot commands',async()=>{const api=await SwaggerParser.dereference(contractPath);
    for(const path of ['/api/v1/billing/checkout','/api/v1/bots/{id}/start','/api/v1/bots/{id}/stop','/api/v1/bots/{id}/restart']){
      const header=api.paths[path].post.parameters.find(parameter=>parameter.name==='Idempotency-Key');assert.equal(header.required,true,path);}});
  it('keeps the documented routers mounted in the application',async()=>{const app=await readFile('src/app.ts','utf8');
    for(const mount of ['app.use(API_V1_PREFIX,apiRouter)','app.use(LEGACY_API_PREFIX,legacyApiDeprecation,apiRouter)',"'/health'","'/metrics'"])assert.ok(app.includes(mount),mount);
    const router=await readFile('src/saas/api.ts','utf8');for(const mount of ["'/auth'","'/billing'","'/email'","'/exchanges'","'/bots'","'/organizations'","'/admin'"])assert.ok(router.includes(mount),mount);
    const bots=await readFile('src/saas/trading/bots.router.ts','utf8');assert.ok(bots.includes("['START','STOP','RESTART']"));});
});
