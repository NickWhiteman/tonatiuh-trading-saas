#!/usr/bin/env node
'use strict';

const base=(process.env.SMOKE_BASE_URL??process.argv[2]??'').replace(/\/$/,'');
if(!base||!base.startsWith('https://')){console.error('SMOKE_BASE_URL must be an HTTPS origin');process.exit(2);}
const timeout=Number(process.env.SMOKE_TIMEOUT_MS??5000);
const probes=[['liveness','/health/live',body=>body.status==='ok'],['readiness','/health/ready',body=>body.status==='ready'],['legal documents','/api/v1/compliance/documents',body=>body.terms&&body.privacy]];
(async()=>{for(const [name,path,validate] of probes){const response=await fetch(`${base}${path}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeout),redirect:'error'});if(!response.ok)throw new Error(`${name} returned HTTP ${response.status}`);const body=await response.json();if(!validate(body))throw new Error(`${name} returned an unexpected response`);console.log(`ok - ${name}`);}})().catch(error=>{console.error(`smoke test failed: ${error.message}`);process.exitCode=1;});
