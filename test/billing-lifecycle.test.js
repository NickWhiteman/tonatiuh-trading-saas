const assert=require('node:assert/strict');const{describe,it}=require('node:test');const{applyPaymentLifecycle,retryDelayHours}=require('../build/saas/billing/lifecycle');
const config={reconciliationMinutes:10,gracePeriodDays:7,retryScheduleHours:[1,24,72,120]};
describe('billing dunning policy',()=>{
  it('uses a bounded attempt-specific schedule',()=>{const schedule=[1,24,72,120];assert.equal(retryDelayHours(1,schedule),1);assert.equal(retryDelayHours(4,schedule),120);assert.equal(retryDelayHours(5,schedule),undefined);});
  it('never reuses the previous attempt slot',()=>{const schedule=[1,24];assert.notEqual(retryDelayHours(1,schedule),retryDelayHours(2,schedule));});
  it('applies a successful paid period only once',async()=>{const queries=[];let applied=false;const client={query:async(sql,params)=>{queries.push({sql,params});if(sql.includes('entitlement_applied_at')){if(applied)return{rowCount:0,rows:[]};applied=true;return{rowCount:1,rows:[{id:'payment'}]};}return{rowCount:1,rows:[]};}};
    const local={organization_id:'organization',provider_payment_id:'payment',kind:'RENEWAL',attempt_number:1};const payment={id:'payment',status:'succeeded',paid:true,amount:{value:'990.00',currency:'RUB'},payment_method:{id:'method',saved:true}};
    await applyPaymentLifecycle(client,local,payment,config);await applyPaymentLifecycle(client,local,payment,config);assert.equal(queries.filter(item=>item.sql.includes('INSERT INTO subscriptions')).length,1);});
  it('records the first canceled renewal against the first retry slot',async()=>{const queries=[];const client={query:async(sql,params)=>{queries.push({sql,params});return{rowCount:1,rows:[{id:'payment'}]};}};
    await applyPaymentLifecycle(client,{organization_id:'organization',provider_payment_id:'payment',kind:'RENEWAL',attempt_number:1},{id:'payment',status:'canceled',amount:{value:'990.00',currency:'RUB'},cancellation_details:{reason:'insufficient_funds'}},config);
    const subscription=queries.find(item=>item.sql.includes('UPDATE subscriptions SET status'));assert.equal(subscription.params[1],1);assert.equal(subscription.params[3],1);});
});
