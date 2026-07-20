import { optionalEnvConfig } from '../plugins/Environment/environment';

export type SaasConfig = {
  databaseUrl: string;
  databasePoolSize: number;
  databaseIdleTimeoutMs: number;
};

function positiveInteger(name: string, fallback: number): number {
  const raw = optionalEnvConfig(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

let cachedConfig: SaasConfig | undefined;

export function getSaasConfig(): SaasConfig {
  if (cachedConfig) return cachedConfig;
  const databaseUrl = optionalEnvConfig('DATABASE_URL');
  if (!databaseUrl) throw new Error('Environment variable DATABASE_URL was not found.');

  cachedConfig = {
    databaseUrl,
    databasePoolSize: positiveInteger('DATABASE_POOL_SIZE', 20),
    databaseIdleTimeoutMs: positiveInteger('DATABASE_IDLE_TIMEOUT_MS', 30_000),
  };
  return cachedConfig;
}
