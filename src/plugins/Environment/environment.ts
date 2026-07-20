import dotenv from 'dotenv';
dotenv.config();

export function envConfig(name: string): string {
  return getEnvVariable(name);
}

export function optionalEnvConfig(name: string): string | undefined {
  return process.env[name] || undefined;
}

function getEnvVariable(name: string) {
  const env = process.env[name];

  if (!env) {
    throw new Error(`Environment variable ${name} was not found.`);
  }

  return env;
}

export function numericEnvConfig(name: string, fallback?: number): number {
  const rawValue = optionalEnvConfig(name);
  if (rawValue === undefined && fallback !== undefined) return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`Environment variable ${name} must be a valid port number.`);
  }
  return value;
}
