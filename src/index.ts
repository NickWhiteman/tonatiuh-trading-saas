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
import { localApiSecurity } from './middleware/local-api-security';
import { parsePositiveId, sendError } from './router/router.utils';
import { runtimeHealth } from './saas/observability/health';
import { logger } from './saas/observability/logger';
import { createApp } from './app';

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

  const app = createApp((desktopApp) => {
    desktopApp.use(localApiSecurity);
    desktopApp.use(prefix.config, configRouter);
    desktopApp.use(prefix.session, tradeSessionRouter);
    desktopApp.use(prefix.operation, tradeOperationRouter);
    desktopApp.use(prefix.balance, balanceRouter);
    desktopApp.use(prefix.identity, identityRouter);
    desktopApp.get('/status', (_req, res) => res.send({ status: 'Trading service is running' }));
    desktopApp.get('/trading/status', (_req, res) => res.send({ workers: tradingWorkerManager.getStatuses() }));
    desktopApp.get('/startTrading/:configId', async (req, res) => {
      try {
        const configId = parsePositiveId(req.params.configId, 'configId');
        if (!databaseList[configId]) databaseListManager.setDatabaseList(configId, `trading_db_${configId}.sqlite`);
        const configsUpdate = await configService.getConfig();
        const config = configsUpdate.find((item) => item.id === configId);
        if (!config) {
          res.status(404).send({ message: `Config ${configId} was not found.` });
          return;
        }
        const result = tradingWorkerManager.start(config);
        res.status(result.started ? 201 : 200).send(result);
      } catch (error) { sendError(res, error); }
    });
  });

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
