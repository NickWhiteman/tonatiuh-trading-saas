import path from 'path';
import { envConfig, numericEnvConfig, optionalEnvConfig } from './environment';

const appMode = optionalEnvConfig('APP_MODE') ?? 'desktop';
if (appMode !== 'desktop' && appMode !== 'web') throw new Error(`Unsupported APP_MODE: ${appMode}`);
const webEnv = (name: string): string => (appMode === 'web' ? envConfig(name) : optionalEnvConfig(name) ?? '');

export const ENV = {
  TRADING_HOST: webEnv('TRADING_HOST'),
  TRADING_PORT: appMode === 'web' ? numericEnvConfig('TRADING_PORT') : 0,
  TRADING_USER: webEnv('TRADING_USER'),
  TRADING_PASSWORD: webEnv('TRADING_PASSWORD'),
  ENCRYPTION_KEY: envConfig('ENCRYPTION_KEY'),
  PORT: numericEnvConfig('PORT', 3131),
  ENV_RELEASE: optionalEnvConfig('ENV_RELEASE') ?? 'prod',
  APP_MODE: appMode as 'desktop' | 'web',
  DATA_DIR: path.resolve(optionalEnvConfig('TONATIUH_DATA_DIR') ?? process.cwd()),
  API_TOKEN: optionalEnvConfig('TONATIUH_API_TOKEN'),
};
