import { TradingVectorProfitService } from './trading-service/TradingVectorProfitService/TradingVectorProfitService';
import { ConfigType } from './repository/types/types';
import { ConfigService } from './utils/ConfigService/ConfigService';
import { format } from 'util';
// import { TradingScalperService } from './trading-service/TradingScalperService/TradingScalperService';

type RuntimeLogLevel = 'INFO' | 'WARN' | 'ERROR';

function forwardRuntimeLogs(): void {
  const methods: Array<{ name: 'log' | 'info' | 'warn' | 'error'; level: RuntimeLogLevel }> = [
    { name: 'log', level: 'INFO' },
    { name: 'info', level: 'INFO' },
    { name: 'warn', level: 'WARN' },
    { name: 'error', level: 'ERROR' },
  ];
  for (const { name, level } of methods) {
    const original = console[name].bind(console);
    console[name] = (...args: unknown[]) => {
      original(...args);
      if (!process.send) return;
      const message = format(...args).trim();
      if (message) process.send({ type: 'runtime-log', level, message, occurredAt: new Date().toISOString() });
    };
  }
}

forwardRuntimeLogs();

const trading = new TradingVectorProfitService();
let config: ConfigType | undefined;

async function worker(nextConfig: ConfigType) {
  try {
    config = nextConfig;
    await new ConfigService().syncRuntimeConfig(nextConfig);
    process.send?.({ type: 'started', configId: nextConfig.id, symbol: nextConfig.symbol });
    while (!isStopping) {
      await trading.startAlgorithms(nextConfig);
    }
  } catch (err) {
    process.send?.({ type: 'error', configId: nextConfig.id, message: String(err) });
    process.exit(1);
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
