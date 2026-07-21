import { optionalEnvConfig } from '../plugins/Environment/environment';

export type SaasConfig = {
  databaseUrl: string;
  databasePoolSize: number;
  databaseIdleTimeoutMs: number;
  databaseConnectionTimeoutMs: number;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
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
  const jwtSecret = optionalEnvConfig('JWT_SECRET');
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  cachedConfig = {
    databaseUrl,
    databasePoolSize: positiveInteger('DATABASE_POOL_SIZE', 20),
    databaseIdleTimeoutMs: positiveInteger('DATABASE_IDLE_TIMEOUT_MS', 30_000),
    databaseConnectionTimeoutMs: positiveInteger('DATABASE_CONNECTION_TIMEOUT_MS', 5_000),
    jwtSecret,
    jwtIssuer: optionalEnvConfig('JWT_ISSUER') ?? 'tonatiuh-trading-saas',
    jwtAudience: optionalEnvConfig('JWT_AUDIENCE') ?? 'tonatiuh-trading-api',
    accessTokenTtlSeconds: positiveInteger('ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtlSeconds: positiveInteger('REFRESH_TOKEN_TTL_SECONDS', 2_592_000),
  };
  return cachedConfig;
}
