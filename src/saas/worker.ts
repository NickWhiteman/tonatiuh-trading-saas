import { ChildProcess, fork } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { PoolClient } from 'pg';
import { optionalEnvConfig } from '../plugins/Environment/environment';
import { EncryptionService } from '../plugins/EncryptionService/EncryptionService';
import { ConfigType, ExchangeType } from '../repository/types/types';
import { getSaasPool, saasQuery, saasTransaction } from './db/pool';

type BotCommand = { id: string; bot_id: string; command: 'START' | 'STOP' | 'RESTART' };
type BotRow = {
  id: string; exchange_code: string; credentials_ciphertext: string; configuration: Record<string, unknown>; sandbox: boolean;
};

const instanceId = randomUUID();
const processes = new Map<string, ChildProcess>();
const restartAttempts = new Map<string, number>();
const dataRoot = path.resolve(optionalEnvConfig('SAAS_BOT_DATA_DIR') ?? path.join(process.cwd(), 'saas-bot-data'));
function positiveMilliseconds(name: string, fallback: number): number {
  const value = Number(optionalEnvConfig(name) ?? fallback);
  if (!Number.isInteger(value) || value < 100 || value > 300_000) throw new Error(`${name} must be between 100 and 300000 milliseconds.`);
  return value;
}
const pollMs = positiveMilliseconds('SAAS_WORKER_POLL_MS', 1000);
const stopTimeoutMs = positiveMilliseconds('SAAS_WORKER_STOP_TIMEOUT_MS', 10_000);
let stopping = false;

const numberValue = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const booleanValue = (value: unknown, fallback = false): boolean => typeof value === 'boolean' ? value : fallback;

function legacyConfig(bot: BotRow): ConfigType {
  const supported: ExchangeType[] = ['okx', 'binance', 'bitget', 'kucoin', 'mexc', 'poloniex', 'gate', 'exmo', 'bybit'];
  if (!supported.includes(bot.exchange_code as ExchangeType)) throw new Error(`Unsupported exchange: ${bot.exchange_code}`);
  const settings = bot.configuration ?? {};
  if (typeof settings.symbol !== 'string' || !settings.symbol.includes('/')) throw new Error('Bot configuration must contain a valid symbol.');
  const credentials = JSON.parse(new EncryptionService().decrypt(bot.credentials_ciphertext)) as Record<string, unknown>;
  if (typeof credentials.apiKey !== 'string' || typeof credentials.privateKey !== 'string') throw new Error('Exchange credentials are incomplete.');
  return {
    id: 1, apiKey: credentials.apiKey, privateKey: credentials.privateKey,
    password: typeof credentials.password === 'string' ? credentials.password : '', symbol: settings.symbol,
    positionSize: numberValue(settings.positionSize, 0.1), countGridSize: numberValue(settings.countGridSize, 1),
    gridSize: numberValue(settings.gridSize, 1), percentBuyBackStep: numberValue(settings.percentBuyBackStep, 0.001),
    takeProfit: numberValue(settings.takeProfit, 0.02), stopLoss: numberValue(settings.stopLoss, 0.01),
    isEmergencyStop: false, isFibonacci: booleanValue(settings.isFibonacci), percentProfit: numberValue(settings.percentProfit, 0.02),
    percentFromBalance: numberValue(settings.percentFromBalance, 0.01), candlePriceRange: typeof settings.candlePriceRange === 'string' ? settings.candlePriceRange : '1h',
    isPercentTargetAfterTakeProfit: booleanValue(settings.isPercentTargetAfterTakeProfit, true),
    isCapitalizeDeltaFromSale: booleanValue(settings.isCapitalizeDeltaFromSale), isCoinAccumulation: booleanValue(settings.isCoinAccumulation),
    isConfigUpdated: false, isAutoStartTrading: false, isStopTrading: false, isOnlyBuy: booleanValue(settings.isOnlyBuy),
    percentTargetAfterTakeProfit: numberValue(settings.percentTargetAfterTakeProfit, 0.01),
    balanceDistribution: booleanValue(settings.balanceDistribution), exchange: bot.exchange_code as ExchangeType,
  };
}

async function loadBot(botId: string): Promise<BotRow> {
  const result = await saasQuery<BotRow>(
    `SELECT b.id,b.configuration,e.exchange_code,e.credentials_ciphertext,e.sandbox FROM trading_bots b
     JOIN exchange_connections e ON e.id=b.exchange_connection_id WHERE b.id=$1 AND e.enabled=true`, [botId],
  );
  if (!result.rows[0]) throw new Error('Bot or enabled exchange connection was not found.');
  return result.rows[0];
}

async function startBot(botId: string): Promise<void> {
  if (processes.get(botId)?.exitCode === null) return;
  const bot = await loadBot(botId);
  const config = legacyConfig(bot);
  const botDataDir = path.join(dataRoot, botId);
  await mkdir(botDataDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(botDataDir, 'database.list.json'), JSON.stringify({ 1: 'trading.sqlite' }), { mode: 0o600 });
  const entry = path.join(__dirname, '..', 'worker.js');
  const childEnvironment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    APP_MODE: 'desktop', ENV_RELEASE: bot.sandbox ? 'dev' : 'prod', TONATIUH_DATA_DIR: botDataDir, PORT: process.env.PORT ?? '3131',
  };
  const child = fork(entry, [], {
    env: childEnvironment,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  processes.set(botId, child);
  child.send({ type: 'start', config });
  await saasQuery(
    `UPDATE trading_bots SET actual_state='STARTING',worker_instance_id=$2,worker_pid=$3,started_at=now(),heartbeat_at=now(),last_error=NULL,updated_at=now() WHERE id=$1`,
    [botId, instanceId, child.pid ?? null],
  );
  child.on('message', (message: { type?: string; message?: string }) => {
    if (message.type === 'started') {
      restartAttempts.delete(botId);
      void saasQuery("UPDATE trading_bots SET actual_state='RUNNING',heartbeat_at=now(),updated_at=now() WHERE id=$1 AND worker_instance_id=$2", [botId, instanceId]);
    }
    if (message.type === 'error') void failBot(botId, message.message ?? 'Trading process failed.');
  });
  child.once('exit', (code, signal) => {
    if (processes.get(botId) !== child) return;
    processes.delete(botId);
    if (!stopping) {
      void failBot(botId, `Trading process exited (code=${code}, signal=${signal}).`);
      scheduleRestart(botId);
    }
  });
}

function scheduleRestart(botId: string): void {
  const attempt = (restartAttempts.get(botId) ?? 0) + 1;
  restartAttempts.set(botId, attempt);
  if (attempt > 3) return;
  const timer = setTimeout(async () => {
    const desired = await saasQuery<{ desired_state: string }>('SELECT desired_state FROM trading_bots WHERE id=$1', [botId]).catch(() => undefined);
    if (!stopping && desired?.rows[0]?.desired_state === 'RUNNING') await startBot(botId).catch((error) => failBot(botId, String(error)));
  }, 1000 * 2 ** (attempt - 1));
  timer.unref();
}

async function failBot(botId: string, message: string): Promise<void> {
  await saasQuery(
    `UPDATE trading_bots SET actual_state='FAILED',worker_pid=NULL,heartbeat_at=now(),last_error=$3,updated_at=now()
     WHERE id=$1 AND worker_instance_id=$2`, [botId, instanceId, message.slice(0, 1000)],
  ).catch((error) => console.error('Failed to persist bot failure.', error));
}

async function stopBot(botId: string): Promise<void> {
  const child = processes.get(botId);
  processes.delete(botId);
  restartAttempts.delete(botId);
  if (child?.exitCode === null) {
    child.send({ type: 'stop' });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGTERM'); resolve(); }, stopTimeoutMs);
      timer.unref();
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  await saasQuery(
    `UPDATE trading_bots SET actual_state='STOPPED',worker_instance_id=NULL,worker_pid=NULL,heartbeat_at=now(),last_error=NULL,updated_at=now() WHERE id=$1`, [botId],
  );
}

async function claimCommand(): Promise<BotCommand | undefined> {
  return saasTransaction(async (client) => {
    const result = await client.query<BotCommand>(
      `SELECT id,bot_id,command FROM bot_commands WHERE status='PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const command = result.rows[0];
    if (command) await client.query("UPDATE bot_commands SET status='PROCESSING' WHERE id=$1", [command.id]);
    return command;
  });
}

async function handleCommand(command: BotCommand): Promise<void> {
  try {
    const desiredState = command.command === 'STOP' ? 'STOPPED' : 'RUNNING';
    await saasQuery('UPDATE trading_bots SET desired_state=$2,updated_at=now() WHERE id=$1', [command.bot_id, desiredState]);
    if (command.command === 'STOP') await stopBot(command.bot_id);
    else {
      if (command.command === 'RESTART') await stopBot(command.bot_id);
      await startBot(command.bot_id);
    }
    await saasQuery("UPDATE bot_commands SET status='SUCCEEDED',processed_at=now() WHERE id=$1", [command.id]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saasQuery("UPDATE bot_commands SET status='FAILED',error=$2,processed_at=now() WHERE id=$1", [command.id, message.slice(0, 1000)]);
    await failBot(command.bot_id, message);
  }
}

async function reconcile(): Promise<void> {
  const desired = await saasQuery<{ id: string }>("SELECT id FROM trading_bots WHERE desired_state='RUNNING'");
  for (const bot of desired.rows) if (!processes.has(bot.id)) await startBot(bot.id).catch((error) => failBot(bot.id, String(error)));
}

async function runLeader(client: PoolClient): Promise<void> {
  console.log(`SaaS worker leader started: ${instanceId}`);
  await reconcile();
  while (!stopping) {
    const command = await claimCommand();
    if (command) await handleCommand(command);
    else await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (processes.size) await saasQuery("UPDATE trading_bots SET heartbeat_at=now() WHERE worker_instance_id=$1 AND actual_state='RUNNING'", [instanceId]);
  }
  await Promise.all([...processes.keys()].map(stopBot));
  await client.query("SELECT pg_advisory_unlock(hashtext('tonatiuh-saas-worker-leader'))");
}

async function main(): Promise<void> {
  while (!stopping) {
    const client = await getSaasPool().connect();
    try {
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('tonatiuh-saas-worker-leader')) locked");
      if (result.rows[0].locked) await runLeader(client);
    } finally { client.release(); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await getSaasPool().end();
}

process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
void main().catch((error) => { console.error('SaaS worker failed.', error); process.exitCode = 1; });
