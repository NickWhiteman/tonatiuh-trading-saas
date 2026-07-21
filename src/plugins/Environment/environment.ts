import dotenv from 'dotenv';
import { readFileSync } from 'fs';
dotenv.config();

const fileValues=new Map<string,string>();

export function envConfig(name: string): string {
  return getEnvVariable(name);
}

export function optionalEnvConfig(name: string): string | undefined {
  const direct=process.env[name];const file=process.env[`${name}_FILE`];
  if(direct&&file)throw new Error(`Only one of ${name} and ${name}_FILE may be set.`);
  if(direct)return direct;
  if(!file)return undefined;
  if(fileValues.has(file))return fileValues.get(file);
  const value=readFileSync(file,'utf8').replace(/[\r\n]+$/,'');
  if(!value)throw new Error(`Secret file for ${name} is empty.`);
  fileValues.set(file,value);return value;
}

function getEnvVariable(name: string) {
  const env = optionalEnvConfig(name);

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
