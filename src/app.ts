import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { localCorsOrigin } from './middleware/local-api-security';
import { apiRouter } from './saas/api';
import { API_V1_PREFIX, legacyApiDeprecation, LEGACY_API_PREFIX } from './saas/api-versioning';
import { errorHandler, requestContext } from './saas/http/middleware';
import { healthRouter } from './saas/observability/health';
import { metricsRouter, observeRequests } from './saas/observability/metrics';

export function createApp(mountAdditionalRoutes?: (app: Express) => void): Express {
  const app = express();
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({
    origin: localCorsOrigin,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['Deprecation','Sunset','Link','X-Request-Id','Retry-After'],
  }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(requestContext);
  app.use(observeRequests);
  app.use('/health', healthRouter);
  app.use('/metrics', metricsRouter);
  app.use(API_V1_PREFIX,apiRouter);
  app.use(LEGACY_API_PREFIX,legacyApiDeprecation,apiRouter);

  mountAdditionalRoutes?.(app);
  app.use(errorHandler);
  return app;
}
