import { ModeType } from '../../types/types';

export type FilledOrderExposure = {
  side: ModeType;
  filled: number;
};

export type ClosingOrderExposure = {
  side: ModeType;
  amount: number;
};

export function calculateClosingOrderExposure(orders: FilledOrderExposure[]): ClosingOrderExposure | undefined {
  const netBaseAmount = orders.reduce((total, order) => {
    const filled = Number(order.filled);
    if (!Number.isFinite(filled) || filled <= 0) return total;
    return total + (order.side === 'buy' ? filled : -filled);
  }, 0);

  if (Math.abs(netBaseAmount) <= Number.EPSILON) return;

  return {
    side: netBaseAmount > 0 ? 'sell' : 'buy',
    amount: Math.abs(netBaseAmount),
  };
}
