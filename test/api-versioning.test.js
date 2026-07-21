const assert=require('node:assert/strict');
const {describe,it}=require('node:test');
const{API_V1_PREFIX,LEGACY_API_PREFIX,LEGACY_API_DEPRECATED_AT,LEGACY_API_SUNSET,legacyApiDeprecation}=require('../build/saas/api-versioning');

describe('API versioning',()=>{
  it('defines distinct canonical and legacy prefixes',()=>{assert.equal(API_V1_PREFIX,'/api/v1');assert.equal(LEGACY_API_PREFIX,'/api');});
  it('marks the unversioned alias with a bounded migration window',()=>{const headers={};let continued=false;
    legacyApiDeprecation({originalUrl:'/api/bots/bot-id?view=summary'}, {setHeader:(name,value)=>{headers[name]=value;}},()=>{continued=true;});
    assert.equal(headers.Deprecation,LEGACY_API_DEPRECATED_AT);assert.equal(headers.Sunset,LEGACY_API_SUNSET);
    assert.equal(headers.Link,'</api/v1/bots/bot-id?view=summary>; rel="successor-version"');assert.equal(continued,true);});
});
