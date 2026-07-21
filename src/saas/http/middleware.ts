import { randomUUID } from 'crypto';
import { ErrorRequestHandler, RequestHandler } from 'express';
import { SaasHttpError } from './errors';
import { verifyAccessToken } from '../security/token';
import { logger } from '../observability/logger';
import { saasQuery } from '../db/pool';
import { runWithDatabaseContext, setTenantDatabaseContext, setUserDatabaseContext } from '../db/access-context';

export const requestContext: RequestHandler = (req, res, next) => {
  const suppliedId = req.header('x-request-id');
  req.requestId = suppliedId && suppliedId.length <= 128 ? suppliedId : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  runWithDatabaseContext(next);
};

export const authenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    next(new SaasHttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
    return;
  }
  let payload;
  try { payload = verifyAccessToken(authorization.slice(7)); }
  catch {
    next(new SaasHttpError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired.'));
    return;
  }
  try { setTenantDatabaseContext(payload.org);setUserDatabaseContext(payload.sub);const membership=(await saasQuery<{role:NonNullable<Express.Request['auth']>['role']}>(`SELECT m.role FROM organization_memberships m
    JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
    WHERE m.user_id=$1 AND m.organization_id=$2 AND u.status='ACTIVE' AND o.status='ACTIVE'`,[payload.sub,payload.org])).rows[0];
    if(!membership)throw new SaasHttpError(401,'ACCOUNT_ACCESS_REVOKED','Account or organization access was revoked.');
    req.auth={userId:payload.sub,organizationId:payload.org,role:membership.role};next();
  }catch(error){next(error);}
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  const knownError = error instanceof SaasHttpError;
  const status = knownError ? error.status : 500;
  if (!knownError) {
    logger.error({requestId:req.requestId,err:error},'request failed');
  }
  res.status(status).json({
    error: {
      code: knownError ? error.code : 'INTERNAL_ERROR',
      message: knownError ? error.message : 'Internal server error.',
      ...(knownError && error.details !== undefined ? { details: error.details } : {}),
      requestId: req.requestId,
    },
  });
};
