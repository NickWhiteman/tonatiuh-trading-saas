import { ModeType } from '../../types/types';

type SessionOrderExposure = {
  side: ModeType;
  amount: number;
};

export function isSessionExposureClosed(orders: SessionOrderExposure[]): boolean {
  if (orders.length < 2 || !orders.some((order) => order.side !== orders[0].side)) return false;
  if (orders.some((order) => !Number.isFinite(Number(order.amount)) || Number(order.amount) <= 0)) return false;

  const netAmount = orders.reduce(
    (total, order) => total + (order.side === 'buy' ? Number(order.amount) : -Number(order.amount)),
    0,
  );
  const totalAmount = orders.reduce((total, order) => total + Math.abs(Number(order.amount)), 0);
  const tolerance = Math.max(1e-12, totalAmount * 1e-8);
  return Math.abs(netAmount) <= tolerance;
}
