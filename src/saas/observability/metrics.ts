import { timingSafeEqual } from 'crypto';
import { RequestHandler, Router } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { optionalEnvConfig } from '../../plugins/Environment/environment';
import { logger } from './logger';
import { runWithServiceDatabaseContext } from '../db/access-context';
import { registerBusinessMetrics } from './business-metrics';

export const metricsRegistry=new Registry();
collectDefaultMetrics({register:metricsRegistry,prefix:'tonatiuh_'});
registerBusinessMetrics(metricsRegistry);
const requests=new Counter({name:'tonatiuh_http_requests_total',help:'Completed HTTP requests',labelNames:['method','route','status'],registers:[metricsRegistry]});
const duration=new Histogram({name:'tonatiuh_http_request_duration_seconds',help:'HTTP request duration',labelNames:['method','route','status'],
  buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10],registers:[metricsRegistry]});

export const observeRequests:RequestHandler=(req,res,next)=>{const started=process.hrtime.bigint();res.once('finish',()=>{
  const route=req.route?.path?`${req.baseUrl}${String(req.route.path)}`:'unmatched';const status=String(res.statusCode);
  const seconds=Number(process.hrtime.bigint()-started)/1e9;requests.inc({method:req.method,route,status});duration.observe({method:req.method,route,status},seconds);
  logger.info({requestId:req.requestId,method:req.method,route,statusCode:res.statusCode,durationMs:Math.round(seconds*1000),userId:req.auth?.userId,organizationId:req.auth?.organizationId},'request completed');
});next();};

function authorized(value:string|undefined,expected:string):boolean{if(!value)return false;const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export const metricsRouter=Router();
metricsRouter.get('/',(req,_res,next)=>runWithServiceDatabaseContext(next),async(req,res,next)=>{try{const token=optionalEnvConfig('METRICS_TOKEN');if(!token){res.status(503).json({error:'Metrics are not configured.'});return;}
  if(!authorized(req.header('authorization'),`Bearer ${token}`)){res.status(401).json({error:'Unauthorized.'});return;}
  res.setHeader('Content-Type',metricsRegistry.contentType);res.send(await metricsRegistry.metrics());}catch(error){next(error);}});
