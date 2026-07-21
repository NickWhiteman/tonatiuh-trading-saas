const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {after,describe,it}=require('node:test');
const {optionalEnvConfig}=require('../build/plugins/Environment/environment');

const directory=mkdtempSync(join(tmpdir(),'tonatiuh-secret-test-'));
after(()=>rmSync(directory,{recursive:true,force:true}));

describe('file-backed environment secrets',()=>{
  it('reads a secret file and removes its trailing newline',()=>{const file=join(directory,'jwt');writeFileSync(file,'secret-value\n',{mode:0o600});
    process.env.TEST_SECRET_FILE=file;try{assert.equal(optionalEnvConfig('TEST_SECRET'),'secret-value');}finally{delete process.env.TEST_SECRET_FILE;}});
  it('rejects ambiguous direct and file-backed values',()=>{const file=join(directory,'database');writeFileSync(file,'file-value',{mode:0o600});
    process.env.TEST_AMBIGUOUS='direct';process.env.TEST_AMBIGUOUS_FILE=file;
    try{assert.throws(()=>optionalEnvConfig('TEST_AMBIGUOUS'),/Only one/);}finally{delete process.env.TEST_AMBIGUOUS;delete process.env.TEST_AMBIGUOUS_FILE;}});
});
