import { LoggerType } from 'types/types';

export interface ILoggerService {
  loggerStrategy: ({
    balance,
    price,
    unrealizedPnl,
    pnlPerUnit,
    positionPnl,
    averageEntryPrice,
    entryAmount,
    buyBackAmount,
    lastPrice,
    side,
    profitPrice,
    percentProfit,
    percentFromBalance,
    percentBuyBackStep,
    takerFee,
    options,
    orders,
    firstCurrency,
    secondCurrency,
  }: LoggerType) => void;
}
