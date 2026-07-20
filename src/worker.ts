import { TradingVectorProfitService } from './trading-service/TradingVectorProfitService/TradingVectorProfitService';
import { ConfigType } from './repository/types/types';
// import { TradingScalperService } from './trading-service/TradingScalperService/TradingScalperService';

const trading = new TradingVectorProfitService();
let config: ConfigType | undefined;

async function worker(nextConfig: ConfigType) {
  try {
    config = nextConfig;
    process.send?.({ type: 'started', configId: nextConfig.id, symbol: nextConfig.symbol });
    await trading.startAlgorithms(nextConfig);
  } catch (err) {
    process.send?.({ type: 'error', configId: nextConfig.id, message: String(err) });
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

process.on('message', (message: { type?: string; config?: ConfigType }) => {
  if (message?.type === 'stop') void stopWorker();
  if (message?.type === 'start' && message.config && !config) void worker(message.config);
});
process.once('SIGTERM', () => void stopWorker());
process.once('SIGINT', () => void stopWorker());
process.once('disconnect', () => void stopWorker());

if (process.argv[2]) void worker(JSON.parse(process.argv[2]) as ConfigType);
