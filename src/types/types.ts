import { Order, Ticker, OHLCV } from 'ccxt';

export enum TimeFrame {
  '1s' = '1s',
  '1m' = '1m',
  '3m' = '3m',
  '5m' = '5m',
  '15m' = '15m',
  '30m' = '30m',
  '1h' = '1h',
  '2h' = '2h',
  '4h' = '4h',
  '6h' = '6h',
  '8h' = '8h',
  '12h' = '12h',
  '1d' = '1d',
  '3d' = '3d',
  '1w' = '1w',
  '1M' = '1M',
}

export type OptionsRequest = {
  [key: string]: string;
};

export type BehaviorRequest = 'GET' | 'POST' | 'PUT';

export type SwapType = {
  swap: string;
};

export type InfoType = {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: string;
  closeTime: string;
  firstId: string;
  lastId: string;
  count: string;
};

type SymbolType = {
  symbol: string;
  timestamp?: Date;
  datetime?: Date;
  high?: number;
  low?: number;
  bid: number;
  bidVolume: number;
  ask: number;
  askVolume: number;
  vwap?: number;
  open?: number;
  close?: number;
  last?: number;
  previousClose?: number;
  change?: number;
  percentage?: number;
  average?: number;
  baseVolume?: number;
  quoteVolume?: number;
  info: Pick<InfoType, 'symbol' | 'bidPrice' | 'bidQty' | 'askPrice' | 'askQty'>;
};

export type ResponseSymbol = {
  [key: string]: SymbolType;
};
export type TickType = Ticker;
export type InfoTypesForAlgo = Pick<Order, 'info'>;
export type CheckingOrderType = {
  closedOrderIds: string[];
  orders: Order[];
};
export type OpenPositionType = {
  symbol: string;
  amount: number;
  price: number;
  params?: { [key: string]: unknown };
};
export type SettingOrderType = {
  symbol: string;
  type: TradeType;
  amount: number;
  price: number;
};
export type InsuranceOrderType = {
  ordersBuy: Order[];
  ordersSell: Order[];
  firstTicker: Ticker;
};
export type ModeType = 'buy' | 'sell';
export type TradeType = 'market' | 'limit';
export type CreateOpenPositionType = Pick<OpenPositionType, 'symbol' | 'amount' | 'price'> & {
  type: TradeType;
  side: ModeType;
  params?: { [key: string]: unknown };
};

export type PositionType = {
  info: InfoType;
  id: string;
  symbol: string;
  timestamp: number;
  datetime: string;
  isolated: boolean;
  hedged: boolean;
  side: 'long' | 'short';
  contracts: number;
  contractSize: number;
  entryPrice: number;
  markPrice: number;
  notional: number;
  leverage: number;
  collateral: number;
  initialMargin: number;
  maintenanceMargin: number;
  initialMarginPercentage: number;
  maintenanceMarginPercentage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  marginMode: 'cross' | 'isolated';
  percentage: number;
};

export type ParametersForCheckingOrdersForOpenOpposideSideType = {
  mode: ModeType;
  symbol: string;
  positionSize: number;
  gridSize: number;
  ordersForChecking: Order[];
};

export type ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType = Pick<
  ParametersForCheckingOrdersForOpenOpposideSideType,
  'symbol' | 'positionSize'
> & {
  order: Order;
  takeProfit: number;
  stopLoss: number;
};

export type CheckingOrdersType = {
  [key: string]: CheckingOrderType;
};

export type OpenLimitPositionByGridLineType = Omit<
  ParametersForCheckingOrdersForOpenOpposideSideType,
  'ordersForChecking'
> & {
  ticker: Ticker;
  numberGridLines: number;
};

export type OpenStopMarketPositionByGridLineType = OpenLimitPositionByGridLineType;

export type StopOrderType = {
  stopPrice?: number; // for open stopOrder
};

export type OpenPositionForAlgorithmParameterType = {
  side: ModeType;
  ticker: Ticker;
  positionSize: number;
  gridSize: number;
  numberGridLines: number;
};

export type OpenLimitPositionParameterType = OpenPositionForAlgorithmParameterType;

export type WatchingProcessParamType = Omit<StartAlgorithmsType, 'typeTrading'> & {
  settingForFirstOrder: SettingOrderType;
  firstOrder: Order;
  price: number;
};

export type TradingType = 'grid' | 'one-trade';

export type StartAlgorithmsType = {
  typeTrading: TradingType;
  watchingTakeProfitLogic?: (param: WatchingTakeProfitLogicType) => Promise<boolean>;
  watchingBuyBackLogic?: (param: WatchingBuyBackLogicType) => Promise<OptionType | false>;
  watchingGridLogic?: () => Promise<void>;
};

export type WatchingTakeProfitLogicType = {
  side: ModeType;
  profitPrice: number;
  unrealizedPnl: number;
  settingTakeProfit: SettingOrderType;
};

export type WatchingBuyBackLogicType = Pick<WatchingTakeProfitLogicType, 'side' | 'unrealizedPnl'> & {
  balance: BalanceType;
  buyingBack: number;
  unrealizedPnl: number;
  nativeCurrency: string;
  convertValue: number;
  lastPrice: number;
  options: OptionType;
};

export type CheckingExistingOrdersType = {
  watchingProcessParam: StartAlgorithmsType;
  watchingProcess: (param: WatchingProcessParamType) => Promise<void>;
  symbol: string;
  indexOperation: string;
};

export type OptionType = {
  buyingBack: number;
  drawdownStep: number;
};

export type SettingCheckingEmergencyStopParam = {
  isEmergencyStop: boolean;
  closeAllAmount: () => Promise<void>;
};

export type GetInfoPriceReturnedType = {
  ticker: Ticker;
  price: number;
  prevCandleOHLC: OHLCV;
  highestInCandle: OHLCV;
  lowestInCandle: OHLCV;
};

type CurrencyType = { free: number; used: number; total: number };
type CurrencyStateType = { BTC: number; OKB: number; ETH: number; USDT: number };

export type BalanceType = {
  info: { code: string; data: any[]; msg: string };
  BTC: CurrencyType;
  OKB: CurrencyType;
  ETH: CurrencyType;
  USDT: CurrencyType;
  timestamp: number;
  datetime: string;
  free: CurrencyStateType;
  used: CurrencyStateType;
  total: CurrencyStateType;
};

export type OpenFirstPositionType = {
  settingForFirstOrder: SettingOrderType;
  price: number;
  lowestInCandle: number;
  highestInCandle: number;
  indexOperation: string;
};

export type OpenPositionForStrategyType = {
  side: ModeType;
  settingOrder: SettingOrderType;
  indexOperation: string;
};

export type ReturnCurrencyBreakdown = {
  firstCurrency: string;
  secondCurrency: string;
};

export type LoggerType = {
  balance: { [key: string]: any };
  price: number;
  unrealizedPnl: number;
  lastPrice: number;
  side: ModeType;
  profitPrice: number;
  percentProfit: number;
  percentFromBalance: number;
  percentBuyBackStep: number;
  takerFee: number;
  options: {
    buyingBack: number;
    drawdownStep: number;
  };
  orders: Order[];
  firstCurrency: string;
  secondCurrency: string;
  deltaForSale: number;
  deltaForBuy: number;
  _identity: string;
  configId: number;
};

export type PriceTrackerParamType = {
  side: ModeType;
  settingOrder: SettingOrderType;
};

export type GetDeltaParamType = {
  side: ModeType;
  buyingBack: number;
  price: number;
  lastPrice: number;
};
