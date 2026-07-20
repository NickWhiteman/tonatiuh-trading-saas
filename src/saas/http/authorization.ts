import { Request, RequestHandler } from 'express';
import { saasQuery } from '../db/pool';
import { SaasHttpError } from './errors';

export type Role = NonNullable<Request['auth']>['role'];
export function authContext(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw new SaasHttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return req.auth;
}
export const requireRoles = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  try { if (!roles.includes(authContext(req).role)) throw new SaasHttpError(403, 'FORBIDDEN', 'Insufficient permissions.'); next(); }
  catch (error) { next(error); }
};
export const requireActiveSubscription: RequestHandler = async (req, _res, next) => {
  try {
    const auth=authContext(req);
    const result=await saasQuery(`SELECT 1 FROM subscriptions WHERE organization_id=$1 AND status='ACTIVE' AND current_period_end>now()`,[auth.organizationId]);
    if(!result.rowCount)throw new SaasHttpError(402,'SUBSCRIPTION_REQUIRED','An active subscription is required.');
    next();
  } catch(error){next(error);}
};
