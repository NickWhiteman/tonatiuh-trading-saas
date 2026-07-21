import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { localCorsOrigin } from './middleware/local-api-security';
import { adminRouter } from './saas/admin/router';
import { authRouter } from './saas/auth/router';
import { billingRouter } from './saas/billing/router';
import { errorHandler, requestContext } from './saas/http/middleware';
import { healthRouter } from './saas/observability/health';
import { metricsRouter, observeRequests } from './saas/observability/metrics';
import { organizationsRouter } from './saas/organizations/router';
import { botsRouter } from './saas/trading/bots.router';
import { exchangesRouter } from './saas/trading/exchanges.router';
import { emailEventsRouter } from './saas/email/router';

export function createApp(mountAdditionalRoutes?: (app: Express) => void): Express {
  const app = express();
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({
    origin: localCorsOrigin,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(requestContext);
  app.use(observeRequests);
  app.use('/health', healthRouter);
  app.use('/metrics', metricsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/email',emailEventsRouter);
  app.use('/api/exchanges', exchangesRouter);
  app.use('/api/bots', botsRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/admin', adminRouter);

  mountAdditionalRoutes?.(app);
  app.use(errorHandler);
  return app;
}
