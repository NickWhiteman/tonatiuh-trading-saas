import { ModeType } from '../types/types';

export type PositionMetrics = {
  pnlPerUnit: number;
  pnlRatio: number;
  positionPnl: number;
};

export function calculatePositionMetrics(
  entrySide: ModeType,
  averageEntryPrice: number,
  lastPrice: number,
  positionAmount: number,
): PositionMetrics {
  if (!(averageEntryPrice > 0) || !(lastPrice > 0) || !(positionAmount >= 0)) {
    throw new Error('Position metrics require positive prices and a non-negative position amount.');
  }
  const pnlPerUnit = entrySide === 'buy' ? lastPrice - averageEntryPrice : averageEntryPrice - lastPrice;
  return {
    pnlPerUnit,
    pnlRatio: pnlPerUnit / averageEntryPrice,
    positionPnl: pnlPerUnit * positionAmount,
  };
}

export function calculateBuyBackAmount(
  averageEntryPrice: number,
  percentBuyBackStep: number,
  drawdownStep: number,
): number {
  if (!(averageEntryPrice > 0) || !(percentBuyBackStep >= 0) || !(drawdownStep >= 1)) {
    throw new Error('Buyback calculation requires a positive price, non-negative step percentage, and drawdown step.');
  }
  return averageEntryPrice * percentBuyBackStep * drawdownStep;
}

export function calculateBuyBackOrderAmount(params: {
  side: ModeType;
  availableBalance: number;
  lastPrice: number;
  percentFromBalance: number;
  positionSize: number;
  drawdownStep: number;
  fibonacci: boolean;
}): number {
  const { side, availableBalance, lastPrice, percentFromBalance, positionSize, drawdownStep, fibonacci } = params;
  if (!(availableBalance > 0) || !(lastPrice > 0)) return 0;
  const amount = fibonacci
    ? positionSize * drawdownStep
    : (availableBalance * percentFromBalance) / (side === 'buy' ? lastPrice : 1);
  const requiredBalance = side === 'buy' ? amount * lastPrice : amount;
  return amount > 0 && requiredBalance <= availableBalance ? amount : 0;
}
