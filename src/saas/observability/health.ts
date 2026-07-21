import { Router } from 'express';
import { ENV } from '../../plugins/Environment/const';
import { getSaasPool } from '../db/pool';

class RuntimeHealth { private ready=false; markReady(){this.ready=true;} markStopping(){this.ready=false;} isReady(){return this.ready;} }
export const runtimeHealth=new RuntimeHealth();
export const healthRouter=Router();
healthRouter.get('/live',(_req,res)=>res.json({status:'ok'}));
healthRouter.get('/ready',async(_req,res)=>{if(!runtimeHealth.isReady()){res.status(503).json({status:'not_ready'});return;}
  try{if(ENV.APP_MODE==='web')await getSaasPool().query('SELECT 1');res.json({status:'ready'});}catch{res.status(503).json({status:'not_ready',database:'unavailable'});}});
