'use strict';
const {describe,it}=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const script='scripts/validate-deployment-inputs.js';const digest=letter=>letter.repeat(64);
describe('staging deployment inputs',()=>{
  it('accepts digest-pinned images and an HTTPS origin',()=>{const run=spawnSync(process.execPath,[script,`ghcr.io/org/app@sha256:${digest('a')}`,`ghcr.io/org/tools@sha256:${digest('b')}`,'https://staging.tonatiuh.ru']);assert.equal(run.status,0,run.stderr.toString());});
  it('rejects mutable tags and shell-shaped origins',()=>{for(const args of [['app:latest',`tools@sha256:${digest('b')}`,'https://staging.example'],[`app@sha256:${digest('a')}`,`tools@sha256:${digest('b')}`,'https://ok.example;id']])assert.equal(spawnSync(process.execPath,[script,...args]).status,2);});
});
