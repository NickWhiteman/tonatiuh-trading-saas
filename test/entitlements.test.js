const assert=require('node:assert/strict');const{describe,it}=require('node:test');const{planCatalog}=require('../build/saas/entitlements/catalog');
describe('SaaS entitlements catalog',()=>{
  it('keeps free limits below paid limits',()=>{for(const key of ['maxExchangeConnections','maxBots','maxMembers','monthlyBotCommands'])assert.ok(planCatalog.FREE[key]<planCatalog.PRO[key],key);assert.equal(planCatalog.FREE.liveTrading,false);assert.equal(planCatalog.PRO.liveTrading,true);});
  it('uses finite non-negative quotas',()=>{for(const plan of Object.values(planCatalog))for(const [key,value] of Object.entries(plan))if(key!=='liveTrading')assert.ok(Number.isInteger(value)&&value>=0,key);});
});
