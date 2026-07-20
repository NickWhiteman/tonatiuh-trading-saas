import { Order } from 'ccxt';

import { BalanceType } from '../types/types';

export interface ISessionTradingService {
  initTradeSession: () => Promise<{ typeSession: string; indexOperation: string }>;
  calculateProfitSession: (indexOperation: string, orders: Order[]) => Promise<number>;
  saveBalanceState(calculateProfitSession: number, orders: Order[]): Promise<BalanceType | undefined>;
  endTradeSession: (calculateProfitSession: number, indexOperation: string) => Promise<void>;
}
