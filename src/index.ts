import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

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

  const prefix = {
    config: '/config',
    session: '/session',
    operation: '/operation',
    balance: '/balance',
    identity: '/identity',
  };

  app.use(cors({ origin: localCorsOrigin, allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(requestContext);
  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
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

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Trading service listening on port ${port}!`);
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    tradingWorkerManager.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 7_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  process.on('uncaughtException', (err) => {
    console.error('There was an uncaught error', err);
    shutdown();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown();
    process.exit(1);
  });
}

main();
