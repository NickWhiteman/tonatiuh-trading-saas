import { booleanValue, numberValue, objectValue, stringValue } from '../http/validate';
import { validationError } from '../http/errors';

const fields=['symbol','positionSize','countGridSize','gridSize','percentBuyBackStep','takeProfit','stopLoss','isFibonacci',
  'percentProfit','percentFromBalance','candlePriceRange','isPercentTargetAfterTakeProfit','isCapitalizeDeltaFromSale',
  'isCoinAccumulation','isOnlyBuy','percentTargetAfterTakeProfit','balanceDistribution'] as const;

export function tradingConfiguration(value:unknown):Record<string,unknown>{
  const input=objectValue(value,fields);const output:Record<string,unknown>={};
  const symbol=stringValue(input.symbol,'configuration.symbol',30).toUpperCase();
  if(!/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/.test(symbol))throw validationError('configuration.symbol must use BASE/QUOTE format.');
  output.symbol=symbol;
  const ranges:Record<string,[number,number]>={positionSize:[0.00000001,1_000_000],countGridSize:[1,100],gridSize:[0.00000001,1_000_000],
    percentBuyBackStep:[0,1],takeProfit:[0,1],stopLoss:[0,1],percentProfit:[0,1],percentFromBalance:[0.00000001,1],percentTargetAfterTakeProfit:[0,1]};
  for(const [field,range] of Object.entries(ranges))if(input[field]!==undefined)output[field]=numberValue(input[field],`configuration.${field}`,range[0],range[1]);
  for(const field of ['isFibonacci','isPercentTargetAfterTakeProfit','isCapitalizeDeltaFromSale','isCoinAccumulation','isOnlyBuy','balanceDistribution'])
    if(input[field]!==undefined)output[field]=booleanValue(input[field],`configuration.${field}`);
  if(input.candlePriceRange!==undefined){const timeframe=stringValue(input.candlePriceRange,'configuration.candlePriceRange',4);if(!['1m','5m','15m','1h','4h','1d'].includes(timeframe))throw validationError('Unsupported candle timeframe.');output.candlePriceRange=timeframe;}
  return output;
}
