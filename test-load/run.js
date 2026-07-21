const http=require('node:http');
const https=require('node:https');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const {Duplex,Readable}=require('node:stream');
const {ServerResponse}=require('node:http');

function percentile(sorted,p){if(!sorted.length)return 0;return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];}
function evaluate(result,thresholds){const failures=[];
  if(result.errorRate>thresholds.maxErrorRate)failures.push(`error rate ${result.errorRate} > ${thresholds.maxErrorRate}`);
  if(result.latencyMs.p95>thresholds.maxP95Ms)failures.push(`p95 ${result.latencyMs.p95}ms > ${thresholds.maxP95Ms}ms`);
  if(result.requestsPerSecond<thresholds.minRps)failures.push(`RPS ${result.requestsPerSecond} < ${thresholds.minRps}`);
  if(thresholds.maxEventLoopP99Ms&&result.eventLoopLagMs?.p99>thresholds.maxEventLoopP99Ms)failures.push(`event-loop p99 ${result.eventLoopLagMs.p99}ms > ${thresholds.maxEventLoopP99Ms}ms`);
  return failures;
}
function positive(name,fallback){const value=Number(process.env[name]??fallback);if(!Number.isFinite(value)||value<=0)throw new Error(`${name} must be positive.`);return value;}

async function localTarget(){
  process.env.APP_MODE??='desktop';process.env.ENV_RELEASE??='dev';process.env.LOG_LEVEL??='silent';process.env.ENCRYPTION_KEY??='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.JWT_SECRET??='load-test-jwt-secret-with-more-than-thirty-two-bytes';
  const {createApp}=require('../build/app');const app=createApp();const path=process.env.LOAD_PATH??'/health/live';
  const request=()=>new Promise(resolve=>{const started=process.hrtime.bigint();let bytes=0;const socket=new Duplex({read(){},write(chunk,_encoding,callback){bytes+=chunk.length;callback();}});socket.remoteAddress='127.0.0.1';
    const req=new Readable({read(){this.push(null);}});req.url=path;req.method='GET';req.headers={};req.httpVersionMajor=1;req.httpVersionMinor=1;req.socket=socket;req.connection=socket;
    const res=new ServerResponse(req);res.assignSocket(socket);res.once('finish',()=>resolve({ok:res.statusCode===200,status:res.statusCode,bytes,ms:Number(process.hrtime.bigint()-started)/1e6}));app(req,res);});
  return{url:`in-process://express${path}`,request,close:async()=>undefined};
}
function oneRequest(url,agent,timeoutMs,expectedStatus,token){return new Promise(resolve=>{const started=process.hrtime.bigint();const transport=url.protocol==='https:'?https:http;
  const req=transport.request(url,{agent,method:'GET',headers:token?{authorization:`Bearer ${token}`}:{},timeout:timeoutMs},res=>{let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;});res.on('end',()=>resolve({ok:res.statusCode===expectedStatus,status:res.statusCode,bytes,ms:Number(process.hrtime.bigint()-started)/1e6}));});
  req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',()=>resolve({ok:false,status:0,bytes:0,ms:Number(process.hrtime.bigint()-started)/1e6}));req.end();});}

async function execute({target,request,durationSeconds,concurrency,warmupSeconds,timeoutMs,expectedStatus,token}){const url=request?undefined:new URL(target);const Agent=url?(url.protocol==='https:'?https.Agent:http.Agent):undefined;const agent=Agent?new Agent({keepAlive:true,maxSockets:concurrency}):undefined;
  const perform=request??(()=>oneRequest(url,agent,timeoutMs,expectedStatus,token));const yieldEvery=request?1:100;const run=async(seconds,record)=>{const deadline=Date.now()+seconds*1000;const results=[];await Promise.all(Array.from({length:concurrency},async()=>{let iterations=0;while(Date.now()<deadline){const item=await perform();if(record)results.push(item);if(++iterations%yieldEvery===0)await new Promise(setImmediate);}}));return results;};
  if(warmupSeconds>0)await run(warmupSeconds,false);const loop=monitorEventLoopDelay({resolution:10});loop.enable();const cpuStart=process.cpuUsage();const started=process.hrtime.bigint();const results=await run(durationSeconds,true);const elapsed=Number(process.hrtime.bigint()-started)/1e9;const cpu=process.cpuUsage(cpuStart);loop.disable();
  const latencies=results.map(item=>item.ms).sort((a,b)=>a-b);const failed=results.filter(item=>!item.ok).length;const statuses={};for(const item of results)statuses[item.status]=(statuses[item.status]??0)+1;
  const round=value=>Number(value.toFixed(2));const output={target,concurrency,durationSeconds:round(elapsed),requests:results.length,requestsPerSecond:round(results.length/elapsed),failed,errorRate:round(failed/Math.max(results.length,1)),bytes:results.reduce((sum,item)=>sum+item.bytes,0),
    latencyMs:{min:round(latencies[0]??0),p50:round(percentile(latencies,.5)),p95:round(percentile(latencies,.95)),p99:round(percentile(latencies,.99)),max:round(latencies.at(-1)??0)},
    eventLoopLagMs:{mean:round(Number(loop.mean)/1e6||0),p99:round(Number(loop.percentile(99))/1e6||0),max:round(Number(loop.max)/1e6||0)},cpuPercent:round(((cpu.user+cpu.system)/1e6)/elapsed*100),rssMb:round(process.memoryUsage().rss/1024/1024),statuses};if(agent)agent.destroy();return output;}

async function main(){let local;try{local=process.env.LOAD_TARGET_URL?undefined:await localTarget();const thresholds={maxErrorRate:Number(process.env.LOAD_MAX_ERROR_RATE??0.001),maxP95Ms:positive('LOAD_MAX_P95_MS',1000),minRps:positive('LOAD_MIN_RPS',100),maxEventLoopP99Ms:positive('LOAD_MAX_EVENT_LOOP_P99_MS',500)};
  const result=await execute({target:process.env.LOAD_TARGET_URL??local.url,request:local?.request,durationSeconds:positive('LOAD_DURATION_SECONDS',15),concurrency:positive('LOAD_CONCURRENCY',50),warmupSeconds:Number(process.env.LOAD_WARMUP_SECONDS??2),timeoutMs:positive('LOAD_TIMEOUT_MS',5000),expectedStatus:Number(process.env.LOAD_EXPECT_STATUS??200),token:process.env.LOAD_BEARER_TOKEN});
  const failures=evaluate(result,thresholds);console.log(JSON.stringify({...result,thresholds,passed:failures.length===0,failures},null,2));if(failures.length)process.exitCode=1;
}finally{if(local)await local.close();}}
if(require.main===module)void main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={percentile,evaluate,execute};
