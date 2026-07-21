import { createHash } from 'crypto';
import { RequestHandler } from 'express';
import { saasQuery } from '../db/pool';
import { SaasHttpError } from './errors';

export function databaseRateLimit(scope:string,limit:number,windowSeconds:number):RequestHandler{return async(req,_res,next)=>{try{
  const identity=`${req.ip}:${typeof req.body?.email==='string'?req.body.email.toLowerCase():''}`;
  const key=createHash('sha256').update(`${scope}:${identity}`).digest('hex');
  const result=await saasQuery<{request_count:number}>(`INSERT INTO request_rate_limits(key_hash,bucket_start,request_count,expires_at)
    VALUES($1,date_trunc('second',now())-((extract(epoch from now())::int%$2)*interval '1 second'),1,now()+($2*2)*interval '1 second')
    ON CONFLICT(key_hash,bucket_start) DO UPDATE SET request_count=request_rate_limits.request_count+1 RETURNING request_count`,[key,windowSeconds]);
  if(result.rows[0].request_count>limit)throw new SaasHttpError(429,'RATE_LIMITED','Too many requests. Try again later.');next();
}catch(error){next(error);}};}
