import { TradingVectorProfitService } from './trading-service/TradingVectorProfitService/TradingVectorProfitService';
import { ConfigType } from './repository/types/types';
// import { TradingScalperService } from './trading-service/TradingScalperService/TradingScalperService';

const trading = new TradingVectorProfitService();
const config: ConfigType = JSON.parse(process.argv[2]);

async function worker() {
  try {
    process.send?.({ type: 'started', configId: config.id, symbol: config.symbol });
    await trading.startAlgorithms(config);
  } catch (err) {
    process.send?.({ type: 'error', configId: config.id, message: String(err) });
    process.exitCode = 1;
  }
}

let isStopping = false;
async function stopWorker() {
  if (isStopping) return;
  isStopping = true;
  try {
    await trading.endAlgorithms();
    process.exit(0);
  } catch (error) {
    console.error('Failed to stop trading worker:', error);
    process.exit(1);
  }
}

process.on('message', (message: { type?: string }) => {
  if (message?.type === 'stop') void stopWorker();
});
process.once('SIGTERM', () => void stopWorker());
process.once('SIGINT', () => void stopWorker());

void worker();
