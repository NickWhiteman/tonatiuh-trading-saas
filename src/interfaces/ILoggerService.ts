import { LoggerType } from 'types/types';

export interface ILoggerService {
  loggerStrategy: ({
    balance,
    price,
    unrealizedPnl,
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
