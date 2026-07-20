import { ChildProcess, fork } from 'child_process';
import path from 'path';
import { ConfigType } from '../repository/types/types';

type WorkerRecord = {
  child: ChildProcess;
  config: ConfigType;
  desiredRunning: boolean;
  restartAttempts: number;
};

export type TradingWorkerStatus = {
  configId: number;
  pid?: number;
  state: 'running' | 'stopping' | 'restarting';
  restartAttempts: number;
};

const MAX_RESTART_ATTEMPTS = 3;
const STOP_TIMEOUT_MS = 5_000;

class TradingWorkerManager {
  private records = new Map<number, WorkerRecord>();

  start(config: ConfigType): { started: boolean; status: TradingWorkerStatus } {
    const existing = this.records.get(config.id);
    if (existing && existing.child.exitCode === null) {
      return { started: false, status: this.toStatus(existing) };
    }

    const record = this.launch(config, 0);
    return { started: true, status: this.toStatus(record) };
  }

  stop(configId: number): boolean {
    const record = this.records.get(configId);
    if (!record) return false;

    record.desiredRunning = false;
    if (record.child.connected) record.child.send({ type: 'stop' });

    const child = record.child;
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGTERM');
    }, STOP_TIMEOUT_MS).unref();

    return true;
  }

  stopAll(): void {
    for (const configId of this.records.keys()) this.stop(configId);
  }

  getStatuses(): TradingWorkerStatus[] {
    return [...this.records.values()].map((record) => this.toStatus(record));
  }

  private launch(config: ConfigType, restartAttempts: number): WorkerRecord {
    const entryPoint = process.env.TRADING_WORKER_ENTRY ?? path.join(__dirname, '..', 'worker.js');
    const child = fork(entryPoint, [JSON.stringify(config)], { env: process.env });
    const record: WorkerRecord = { child, config, desiredRunning: true, restartAttempts };
    this.records.set(config.id, record);

    child.on('exit', (code, signal) => {
      if (this.records.get(config.id)?.child !== child) return;

      if (record.desiredRunning && code !== 0 && restartAttempts < MAX_RESTART_ATTEMPTS) {
        const nextAttempt = restartAttempts + 1;
        const delay = 1_000 * 2 ** (nextAttempt - 1);
        console.error(
          `Trading worker ${config.id} exited (code=${code}, signal=${signal}); restart ${nextAttempt}/${MAX_RESTART_ATTEMPTS} in ${delay}ms.`,
        );
        record.restartAttempts = nextAttempt;
        setTimeout(() => {
          if (record.desiredRunning) this.launch(config, nextAttempt);
        }, delay).unref();
        return;
      }

      this.records.delete(config.id);
    });

    child.on('error', (error) => console.error(`Trading worker ${config.id} error:`, error));
    return record;
  }

  private toStatus(record: WorkerRecord): TradingWorkerStatus {
    return {
      configId: record.config.id,
      pid: record.child.pid,
      state: record.desiredRunning ? (record.restartAttempts ? 'restarting' : 'running') : 'stopping',
      restartAttempts: record.restartAttempts,
    };
  }
}

export const tradingWorkerManager = new TradingWorkerManager();
