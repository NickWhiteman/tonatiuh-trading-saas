import { Router } from 'express';
import { adminRouter } from './admin/router';
import { authRouter } from './auth/router';
import { billingRouter } from './billing/router';
import { emailEventsRouter } from './email/router';
import { organizationsRouter } from './organizations/router';
import { botsRouter } from './trading/bots.router';
import { exchangesRouter } from './trading/exchanges.router';

export const apiRouter=Router();
apiRouter.use('/auth',authRouter);
apiRouter.use('/billing',billingRouter);
apiRouter.use('/email',emailEventsRouter);
apiRouter.use('/exchanges',exchangesRouter);
apiRouter.use('/bots',botsRouter);
apiRouter.use('/organizations',organizationsRouter);
apiRouter.use('/admin',adminRouter);
