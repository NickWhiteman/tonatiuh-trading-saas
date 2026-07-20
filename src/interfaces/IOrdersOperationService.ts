import { Order } from 'ccxt';
import {
  CheckingExistingOrdersType,
  CreateOpenPositionType,
  ModeType,
  OpenFirstPositionType,
  OpenLimitPositionByGridLineType,
  OpenPositionForStrategyType,
  OpenStopMarketPositionByGridLineType,
  SettingOrderType,
} from '../types/types';
import { OrderType } from '../repository/types/types';

export interface IOrdersOperationService {
  orders: OrderType[];
  setOrders: (orders: OrderType[]) => Promise<void>;
  openStopMarketPositionByGridLineByuHightSellLowActualPrice: (
    OpenStopMarketPositionByGridLine: OpenStopMarketPositionByGridLineType,
  ) => Promise<void>;
  openLimitPositionByGridLineBuyLowSellHight: (
    openLimitPositionByGridLine: OpenLimitPositionByGridLineType,
  ) => Promise<void>;
  cancelAllOrders: (symbol: string) => Promise<void>;
  createMarketOrLimitOrStopOrder: (settings: CreateOpenPositionType) => Promise<void>;
  openStopMarketPosition: (positionData: CreateOpenPositionType) => Promise<void>;
  checkingExistingOrders: (param: CheckingExistingOrdersType) => Promise<void>;
  checkStatusOrderById: (orderId: string, symbol: string) => Promise<Order>;
  getOrderByOrderId: (orderId: string) => Promise<OrderType | undefined>;
  revertActiveStateOrder: (indexOperation: string) => Promise<void>;
  openFirstPosition(param: OpenFirstPositionType): Promise<Order>;
  openPositionForStrategy: (param: OpenPositionForStrategyType) => Promise<Order>;
  clearingOrderList: () => Promise<void>;
  getAllOrdersByIndexOperation: (indexSession: string) => Promise<OrderType[] | undefined>;
  getProfitForTradeSession: (indexOperation: string, side: ModeType, orders: OrderType[]) => Promise<number>;
}
