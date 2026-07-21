const assert=require('node:assert/strict');
const{describe,it}=require('node:test');
const{decideFeature,rolloutBucket}=require('../build/saas/features/service');

describe('feature flag rollout policy',()=>{
  const organizationId='11111111-1111-4111-8111-111111111111';
  it('assigns an organization to a stable bounded bucket',()=>{const first=rolloutBucket('billing_checkout',organizationId);assert.equal(first,rolloutBucket('billing_checkout',organizationId));assert.ok(first>=0&&first<100);});
  it('gives the global kill switch precedence over overrides',()=>{assert.deepEqual(decideFeature({key:'billing_checkout',enabled:false,rollout_percentage:100,override_enabled:true},organizationId),{key:'billing_checkout',enabled:false,source:'kill_switch'});});
  it('uses organization overrides before percentage rollout',()=>{assert.deepEqual(decideFeature({key:'billing_checkout',enabled:true,rollout_percentage:0,override_enabled:true},organizationId),{key:'billing_checkout',enabled:true,source:'organization_override'});});
  it('honors zero and full rollouts',()=>{assert.equal(decideFeature({key:'billing_checkout',enabled:true,rollout_percentage:0,override_enabled:null},organizationId).enabled,false);assert.equal(decideFeature({key:'billing_checkout',enabled:true,rollout_percentage:100,override_enabled:null},organizationId).enabled,true);});
});
