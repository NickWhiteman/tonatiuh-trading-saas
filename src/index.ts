import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';

import configRouter from './router/config.router';
import tradeSessionRouter from './router/trade-session.router';
import tradeOperationRouter from './router/trade-operation.router';
import balanceRouter from './router/balance.router';
import identityRouter from './router/instance-identity.router';
import { ENV } from './plugins/Environment/const';
import { ConfigType } from './repository/types/types';
import { ConfigService } from './utils/ConfigService/ConfigService';
import { GetDatabaseList } from './plugins/FileSystemUtils/GetFileSystem/GetDatabaseList';
import { tradingWorkerManager } from './process/TradingWorkerManager';
import { localApiSecurity, localCorsOrigin } from './middleware/local-api-security';
import { parsePositiveId, sendError } from './router/router.utils';
import { errorHandler, requestContext } from './saas/http/middleware';
import { authRouter } from './saas/auth/router';
import { billingRouter } from './saas/billing/router';
import { exchangesRouter } from './saas/trading/exchanges.router';
import { botsRouter } from './saas/trading/bots.router';
import { healthRouter, runtimeHealth } from './saas/observability/health';
import { metricsRouter, observeRequests } from './saas/observability/metrics';
import { logger } from './saas/observability/logger';
import { organizationsRouter } from './saas/organizations/router';
import { adminRouter } from './saas/admin/router';

function autoStarterTrading({
  configs,
  databaseList,
  databaseListManager,
}: {
  configs: ConfigType[];
  databaseList: { [key: string]: string };
  databaseListManager: GetDatabaseList;
}) {
  if (configs.length > 0) {
    configs.forEach((config) => {
      if (config.isAutoStartTrading) {
        if (!databaseList[config.id]) {
          const dbName = `trading_db_${config.id}.sqlite`;
          databaseListManager.setDatabaseList(config.id, dbName);
        }

        tradingWorkerManager.start(config);
      }
    });
  }
}

async function main() {
  const app = express();
  const configService = new ConfigService();
  const databaseListManager = new GetDatabaseList();
  const databaseList = databaseListManager.getDatabaseList();
  const configs = await configService.getConfig();
  const port = ENV.PORT;
  const trustProxy=process.env.TRUST_PROXY;
  if(trustProxy)app.set('trust proxy',/^\d+$/.test(trustProxy)?Number(trustProxy):trustProxy);
  app.disable('x-powered-by');

  const prefix = {
    config: '/config',
    session: '/session',
    operation: '/operation',
    balance: '/balance',
    identity: '/identity',
  };

  app.use(helmet());
  app.use(cors({ origin: localCorsOrigin, allowedHeaders: ['Content-Type', 'Authorization','Idempotency-Key','X-Request-Id'] }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(requestContext);
  app.use(observeRequests);
  app.use('/health',healthRouter);
  app.use('/metrics',metricsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/exchanges', exchangesRouter);
  app.use('/api/bots', botsRouter);
  app.use('/api/organizations',organizationsRouter);
  app.use('/api/admin',adminRouter);
  app.use(localApiSecurity);
  app.use(prefix.config, configRouter);
  app.use(prefix.session, tradeSessionRouter);
  app.use(prefix.operation, tradeOperationRouter);
  app.use(prefix.balance, balanceRouter);
  app.use(prefix.identity, identityRouter);

  app.get('/status', (req, res) => {
    res.send({ status: 'Trading service is running' });
  });

  app.get('/trading/status', (req, res) => res.send({ workers: tradingWorkerManager.getStatuses() }));

  app.get('/startTrading/:configId', async (req, res) => {
    try {
      const configId = parsePositiveId(req.params.configId, 'configId');
      if (!databaseList[configId]) {
        databaseListManager.setDatabaseList(configId, `trading_db_${configId}.sqlite`);
      }
      const configsUpdate = await configService.getConfig();
      const config = configsUpdate.find((item) => item.id === configId);
      if (!config) {
        res.status(404).send({ message: `Config ${configId} was not found.` });
        return;
      }
      const result = tradingWorkerManager.start(config);
      res.status(result.started ? 201 : 200).send(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.use(errorHandler);

  autoStarterTrading({
    configs,
    databaseList,
    databaseListManager,
  });

  const server = app.listen(port, ENV.HOST, () => {
    runtimeHealth.markReady();
    logger.info({port,host:ENV.HOST,appMode:ENV.APP_MODE},'trading service started');
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    runtimeHealth.markStopping();
    logger.info('shutdown started');
    tradingWorkerManager.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 7_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  process.on('uncaughtException', (err) => {
    logger.fatal({err},'uncaught exception');
    shutdown();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({promise,reason},'unhandled rejection');
    shutdown();
    process.exit(1);
  });
}

main();
