import { Order } from 'ccxt';

export type OrderType = {
  id: number;
  orderId: string;
  order: Order;
  createAt: number;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  symbol: string;
  isActive: number;
};

export type CreateOrderParamsType = Pick<OrderType, 'orderId' | 'order' | 'price' | 'amount' | 'side' | 'symbol'> & {
  indexOperation: string;
};

export type TableNameType =
  | 'trade_operation'
  | 'balance_history'
  | 'trade_session'
  | 'trade_config'
  | 'instance_identity';

export type ValueType = {
  column: string;
  value: string | number;
};
type WhereType = ValueType;

export type UpdateQueryParamType = {
  tableName: TableNameType;
  value: ValueType[];
  where?: WhereType[];
  operationCondition?: 'and' | 'or';
};

export type InsertQueryParamType = Pick<UpdateQueryParamType, 'tableName'> & {
  value: ValueType[];
};

export type SelectQueryParamType = Pick<UpdateQueryParamType, 'tableName' | 'where' | 'operationCondition'> & {
  column: string[];
  join?: JoinTableType[];
  orderBy?: {
    column: string;
    type: 'asc' | 'desc';
  };
  limit?: number;
};
export type JoinType = 'left' | 'right' | 'inner';
export type JoinTableType = {
  joinType: JoinType;
  conditionEqual: [string, string];
  joinTable: string;
};

export type WhereGenerationParamType = Pick<UpdateQueryParamType, 'operationCondition' | 'where'>;
export type ValueGenerationParamType = ValueType;

export type CreateStateBalanceParamType = {
  usdt: number;
  profitAll: number;
  exchangeName: string;
  updateDate?: Date | string;
  profitUsdt: number;
  balanceObject: string;
};

export type ExchangeType = 'okx' | 'binance' | 'bitget' | 'kucoin' | 'mexc' | 'poloniex' | 'gate' | 'exmo' | 'bybit';

export type ConfigType = {
  id: number;
  apiKey: string;
  privateKey: string;
  password: string;
  symbol: string;
  positionSize: number;
  countGridSize: number | null;
  gridSize: number | null;
  percentBuyBackStep: number;
  takeProfit: number | null;
  stopLoss: number | null;
  isEmergencyStop: boolean;
  isFibonacci: boolean;
  percentProfit: number;
  percentFromBalance: number;
  candlePriceRange: string;
  isPercentTargetAfterTakeProfit: boolean;
  isCapitalizeDeltaFromSale: boolean;
  isCoinAccumulation: boolean;
  isConfigUpdated: boolean;
  isAutoStartTrading: boolean;
  isStopTrading: boolean;
  isOnlyBuy: boolean;
  percentTargetAfterTakeProfit: number;
  balanceDistribution: boolean;
  exchange: ExchangeType;
};

export type BalanceStateType = Omit<CreateStateBalanceParamType, 'exchangeName' | 'updateDate'>;

export type SessionType = {
  indexSession: string;
  isActive: boolean;
};

export type InstanceIdentityType = {
  clientId: string;
  createAt: string;
  updateAt: string;
};

export enum ColumnName {
  id = 'id',
  //balance_history
  usdt = 'usdt',
  profitAll = 'profit_all',
  exchangeName = 'exchange_name',
  updateDate = 'update_date',
  profitUsdt = 'profit_usdt',
  balanceObject = 'balance_object',
  //trading_operation
  symbol = 'symbol',
  orderId = 'order_id',
  order = '"order"',
  price = 'price',
  amount = 'amount',
  side = 'side',
  indexOperation = 'index_operation',
  createAt = 'create_at',
  isActive = 'is_active',
  //trade_session
  indexSession = 'index_session',
  profitSession = 'profit_session',
  //trade_config
  exchange = 'exchange',
  apiKey = 'api_key',
  privateKey = 'private_key',
  password = 'password',
  positionSize = 'position_size',
  countGridSize = 'count_grid_size',
  gridSize = 'grid_size',
  balanceDistribution = 'balance_distribution',
  percentBuyBackStep = 'percent_buy_back',
  takeProfit = 'take_profit',
  stopLoss = 'stop_loss',
  isEmergencyStop = 'is_emergency_stop',
  percentProfit = 'percent_profit',
  percentFromBalance = 'percent_from_balance',
  candlePriceRange = 'candle_price_range',
  isFibonacci = 'is_fibonacci',
  isOnlyBuy = 'is_only_buy',
  isPercentTargetAfterTakeProfit = 'is_percent_target_after_take_profit',
  percentTargetAfterTakeProfit = 'percent_target_after_take_profit',
  isCapitalizeDeltaFromSale = 'is_capitalize_delta_from_sale',
  isCoinAccumulation = 'is_coin_accumulation',
  isAutoStartTrading = 'is_auto_start_trading',
  isStopTrading = 'is_stop_trading',
  loggerEvent = 'logger_event',
  // instance_identity
  clientId = 'client_id',
}
