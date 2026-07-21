const assert=require('node:assert/strict');
const{describe,it}=require('node:test');
const{getComplianceConfig}=require('../build/saas/compliance/config');
const{evidenceHash}=require('../build/saas/compliance/service');

const names=['ENV_RELEASE','TERMS_VERSION','PRIVACY_VERSION','TERMS_URL','PRIVACY_URL','TERMS_SHA256','PRIVACY_SHA256','CONSENT_EVIDENCE_SECRET','CONSENT_EVIDENCE_KEY_ID'];
function production(){Object.assign(process.env,{ENV_RELEASE:'prod',TERMS_VERSION:'2026-07',PRIVACY_VERSION:'2026-07',TERMS_URL:'https://example.test/terms/2026-07',PRIVACY_URL:'https://example.test/privacy/2026-07',TERMS_SHA256:'a'.repeat(64),PRIVACY_SHA256:'b'.repeat(64),CONSENT_EVIDENCE_SECRET:'c'.repeat(32),CONSENT_EVIDENCE_KEY_ID:'consent-v1'});}
function isolated(work){const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));try{return work();}finally{for(const name of names)old[name]===undefined?delete process.env[name]:process.env[name]=old[name];}}

describe('compliance governance',()=>{
  it('accepts immutable HTTPS documents and a separate evidence key',()=>isolated(()=>{production();const config=getComplianceConfig();assert.equal(config.documents.terms.version,'2026-07');assert.equal(config.documents.privacy.sha256,'b'.repeat(64));}));
  it('rejects placeholder document digests in production',()=>isolated(()=>{production();process.env.TERMS_SHA256='0'.repeat(64);assert.throws(()=>getComplianceConfig(),/non-placeholder/);}));
  it('pseudonymizes evidence deterministically without storing raw values',()=>{const secret='s'.repeat(32);const hash=evidenceHash('user@example.test',secret);assert.match(hash,/^[0-9a-f]{64}$/);assert.equal(hash,evidenceHash('user@example.test',secret));assert.notEqual(hash,evidenceHash('other@example.test',secret));});
});
