import { NextFunction, Request, Response } from 'express';
import { ENV } from '../plugins/Environment/const';

export function localApiSecurity(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/status' || req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!ENV.API_TOKEN) {
    if (ENV.ENV_RELEASE === 'dev') {
      next();
      return;
    }

    res.status(503).send({ message: 'TONATIUH_API_TOKEN is not configured.' });
    return;
  }

  if (req.header('authorization') !== `Bearer ${ENV.API_TOKEN}`) {
    res.status(401).send({ message: 'Unauthorized.' });
    return;
  }

  next();
}

export function localCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
  if (!origin || (ENV.APP_MODE === 'desktop' && origin === 'null')) {
    callback(null, true);
    return;
  }

  const allowed=(process.env.CORS_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean);
  if (ENV.APP_MODE === 'web' && allowed.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed.`));
}
