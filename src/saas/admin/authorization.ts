import { RequestHandler } from 'express';
import { saasQuery } from '../db/pool';
import { authContext } from '../http/authorization';
import { SaasHttpError } from '../http/errors';

export const requirePlatformAdmin:RequestHandler=async(req,_res,next)=>{try{const auth=authContext(req);const result=await saasQuery(
  "SELECT 1 FROM users WHERE id=$1 AND status='ACTIVE' AND platform_role='ADMIN'",[auth.userId]);
  if(!result.rowCount)throw new SaasHttpError(403,'PLATFORM_ADMIN_REQUIRED','Platform administrator access is required.');next();
}catch(error){next(error);}};
