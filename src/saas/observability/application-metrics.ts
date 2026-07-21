import { Counter } from 'prom-client';
import { metricsRegistry } from './registry';
const quotaDenials=new Counter({name:'tonatiuh_quota_denials_total',help:'Rejected quota operations',labelNames:['resource','plan'],registers:[metricsRegistry]});
export const recordQuotaDenial=(resource:string,plan:string)=>quotaDenials.inc({resource,plan});
