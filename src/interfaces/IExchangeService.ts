import { Order } from 'ccxt';

import {
  BalanceType,
  CreateOpenPositionType,
  GetInfoPriceReturnedType,
  ModeType,
  OpenPositionType,
  SwapType,
  TickType,
} from '../types/types';

export interface IExchangeService {
  getSwap: (symbol: string[]) => Promise<SwapType>;
  getTick: (symbol: string) => Promise<TickType>;
  getBalance: () => Promise<BalanceType>;
  getFee: () => Promise<unknown>;
  getPrice: (symbol: string) => Promise<number>;
  openLongMarketPosition: (symbol: string, amount: number) => Promise<Order>;
  openShortMarketPosition: (symbol: string, amount: number) => Promise<Order>;
  openLimitLongPosition: (positionData: OpenPositionType) => Promise<Order>;
  openLimitShortPosition: (positionData: OpenPositionType) => Promise<Order>;
  checkStatusOrderById: (id: string, symbol: string) => Promise<Order>;
  cancelAllOrders: (symbol: string) => Promise<void>;
  getOpenOrders: (symbol: string) => Promise<Order[]>;
  getUnrealizedPnl: (symbol: string, priceOrder: number, side: ModeType) => Promise<number>;
  getInfoPrice: (symbol: string, candlePriceRange: string) => Promise<GetInfoPriceReturnedType>;
  createStopMarketOrder: (param: CreateOpenPositionType) => Promise<Order>;
  createOrder: (param: CreateOpenPositionType) => Promise<Order>;
}
