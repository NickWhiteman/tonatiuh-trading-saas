import {Router} from 'express';
import {authenticate} from '../http/middleware';
import {authContext} from '../http/authorization';
import {listClientFeatures} from './service';

export const featuresRouter=Router();
featuresRouter.use(authenticate);
featuresRouter.get('/',async(req,res,next)=>{try{const auth=authContext(req);const decisions=await listClientFeatures(auth.organizationId);
  res.setHeader('Cache-Control','private, max-age=30');res.json({features:Object.fromEntries(decisions.map(item=>[item.key,item.enabled]))});
}catch(error){next(error);}});
