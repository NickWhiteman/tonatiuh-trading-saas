import { randomUUID } from 'crypto';
import { ErrorRequestHandler, RequestHandler } from 'express';
import { SaasHttpError } from './errors';

export const requestContext: RequestHandler = (req, res, next) => {
  const suppliedId = req.header('x-request-id');
  req.requestId = suppliedId && suppliedId.length <= 128 ? suppliedId : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  const knownError = error instanceof SaasHttpError;
  const status = knownError ? error.status : 500;
  if (!knownError) {
    console.error(JSON.stringify({ level: 'error', requestId: req.requestId, error }));
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
