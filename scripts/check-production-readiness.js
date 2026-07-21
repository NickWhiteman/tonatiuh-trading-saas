#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const dotenv=require('dotenv');
const {evaluateProductionReadiness}=require('./production-readiness');
for(const path of ['.env.production','.env.release'])if(fs.existsSync(path))dotenv.config({path,override:false});
const report=evaluateProductionReadiness();
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(!report.ready)process.exitCode=1;
