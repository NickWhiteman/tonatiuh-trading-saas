#!/usr/bin/env node
'use strict';
const values=process.argv.slice(2);const reference=/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/i;
if(values.length!==3||!values.slice(0,2).every(value=>reference.test(value))||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(values[2])){console.error('Expected two digest-pinned image references and one HTTPS smoke origin.');process.exit(2);}
