import { Response } from 'express';

const CONFIG_FIELDS = new Set([
  'id',
  'apiKey',
  'privateKey',
  'password',
  'symbol',
  'positionSize',
  'countGridSize',
  'gridSize',
  'percentBuyBackStep',
  'takeProfit',
  'stopLoss',
  'isEmergencyStop',
  'isFibonacci',
  'percentProfit',
  'percentFromBalance',
  'candlePriceRange',
  'isPercentTargetAfterTakeProfit',
  'isCapitalizeDeltaFromSale',
  'isCoinAccumulation',
  'isAutoStartTrading',
  'isStopTrading',
  'isOnlyBuy',
  'percentTargetAfterTakeProfit',
  'balanceDistribution',
  'exchange',
  'loggerEvent',
]);

export function parsePositiveId(value: unknown, name = 'id'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${name} must be a positive integer.`);
  return id;
}

export function validateConfigPayload(value: unknown, requireId: boolean): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Config payload must be an object.');
  }

  const config = value as Record<string, unknown>;
  const unknownFields = Object.keys(config).filter((key) => !CONFIG_FIELDS.has(key));
  if (unknownFields.length) throw new HttpError(400, `Unknown config fields: ${unknownFields.join(', ')}.`);
  if (requireId) parsePositiveId(config.id, 'id');

  for (const key of ['symbol', 'exchange', 'candlePriceRange', 'apiKey', 'privateKey', 'password', 'loggerEvent']) {
    if (config[key] !== undefined && typeof config[key] !== 'string') {
      throw new HttpError(400, `${key} must be a string.`);
    }
  }

  for (const [key, fieldValue] of Object.entries(config)) {
    if (fieldValue === undefined || fieldValue === null || key === 'id') continue;
    if (key.startsWith('is') || key === 'balanceDistribution') {
      if (typeof fieldValue !== 'boolean') throw new HttpError(400, `${key} must be a boolean.`);
    } else if (!['symbol', 'exchange', 'candlePriceRange', 'apiKey', 'privateKey', 'password', 'loggerEvent'].includes(key)) {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
        throw new HttpError(400, `${key} must be a finite number.`);
      }
    }
  }

  return config;
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function sendError(res: Response, error: unknown): void {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : 'Unexpected server error.';
  if (status === 500) console.error(error);
  res.status(status).send({ message });
}
