import {createHash} from 'crypto';
import {RequestHandler} from 'express';
import {saasQuery} from '../db/pool';
import {SaasHttpError} from '../http/errors';

type FlagRow={key:string;description:string;enabled:boolean;rollout_percentage:number;client_visible:boolean;override_enabled:boolean|null};
export type FeatureDecision={key:string;enabled:boolean;source:'kill_switch'|'organization_override'|'percentage_rollout'};

export function rolloutBucket(flagKey:string,organizationId:string):number{
  const digest=createHash('sha256').update(`${flagKey}:${organizationId}`).digest();
  return digest.readUInt32BE(0)%100;
}

export function decideFeature(row:Pick<FlagRow,'key'|'enabled'|'rollout_percentage'|'override_enabled'>,organizationId:string):FeatureDecision{
  if(!row.enabled)return{key:row.key,enabled:false,source:'kill_switch'};
  if(row.override_enabled!==null)return{key:row.key,enabled:row.override_enabled,source:'organization_override'};
  return{key:row.key,enabled:rolloutBucket(row.key,organizationId)<row.rollout_percentage,source:'percentage_rollout'};
}

export async function evaluateFeature(flagKey:string,organizationId:string):Promise<FeatureDecision>{
  const row=(await saasQuery<FlagRow>(`SELECT f.key,f.description,f.enabled,f.rollout_percentage,f.client_visible,o.enabled override_enabled
    FROM feature_flags f LEFT JOIN feature_flag_overrides o ON o.flag_key=f.key AND o.organization_id=$2 WHERE f.key=$1`,[flagKey,organizationId])).rows[0];
  if(!row)throw new SaasHttpError(503,'FEATURE_CONFIGURATION_MISSING','Required feature configuration is missing.');
  return decideFeature(row,organizationId);
}

export const requireFeature=(flagKey:string):RequestHandler=>async(req,res,next)=>{try{
  if(!req.auth)throw new SaasHttpError(401,'AUTHENTICATION_REQUIRED','Authentication is required.');
  const decision=await evaluateFeature(flagKey,req.auth.organizationId);if(!decision.enabled){res.setHeader('Retry-After','300');throw new SaasHttpError(503,'FEATURE_DISABLED','This feature is temporarily unavailable.',{feature:flagKey});}next();
}catch(error){next(error);}};

export async function listClientFeatures(organizationId:string):Promise<FeatureDecision[]>{
  const rows=(await saasQuery<FlagRow>(`SELECT f.key,f.description,f.enabled,f.rollout_percentage,f.client_visible,o.enabled override_enabled
    FROM feature_flags f LEFT JOIN feature_flag_overrides o ON o.flag_key=f.key AND o.organization_id=$1 WHERE f.client_visible=true ORDER BY f.key`,[organizationId])).rows;
  return rows.map(row=>decideFeature(row,organizationId));
}
