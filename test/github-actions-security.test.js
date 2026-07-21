'use strict';
const {describe,it}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const workflowDir=path.join(__dirname,'..','.github','workflows');const workflows=fs.readdirSync(workflowDir).filter(name=>name.endsWith('.yml')).map(name=>fs.readFileSync(path.join(workflowDir,name),'utf8')).join('\n');
describe('GitHub Actions supply-chain policy',()=>{
  it('pins every external action to a full commit SHA',()=>{const refs=[...workflows.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map(match=>match[1]);assert.ok(refs.length>0);for(const ref of refs)assert.match(ref,/@[a-f0-9]{40}$/,`${ref} is not commit-pinned`);});
  it('does not use deprecated Node.js 20 action majors',()=>{assert.doesNotMatch(workflows,/actions\/(checkout|setup-node)@[^\s#]+\s*#\s*v4\b/);assert.doesNotMatch(workflows,/docker\/(setup-buildx-action|login-action)@[^\s#]+\s*#\s*v3\b/);assert.doesNotMatch(workflows,/docker\/(metadata-action|build-push-action)@[^\s#]+\s*#\s*v5\b/);});
});
