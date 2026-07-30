import ccxt, { Dictionary, Exchange, OHLCV, Order, Ticker } from 'ccxt';

import {
  BalanceType,
  CreateOpenPositionType,
  GetInfoPriceReturnedType,
  OpenPositionType,
  SwapType,
  TickType,
  TimeFrame,
} from '../../types/types';
import { IExchangeService } from '../../interfaces/IExchangeService';
import { ENV } from '../../plugins/Environment/const';

export class ExchangeService implements IExchangeService {
  private _ccxt: Exchange;
  private _balanceCache?: { value: BalanceType; expiresAt: number };

  constructor(exchangeId: string, apiKey: string, privateKey: string, password: string) {
    this._ccxt = new ccxt[exchangeId]({
      apiKey: apiKey,
      secret: privateKey,
      password: password ?? '',
      enableRateLimit: true,
      timeout: 20_000,
    });
    this._ccxt.setSandboxMode(ENV.ENV_RELEASE === 'dev' ? true : false);
  }

  async getFee(): Promise<unknown> {
    return this._ccxt.fetchTradingFee();
  }

  async getBalance(): Promise<BalanceType> {
    if (this._balanceCache && this._balanceCache.expiresAt > Date.now()) return this._balanceCache.value;
    const balance = await this._readWithRetry<BalanceType>(
      'fetchBalance',
      () => this._ccxt.fetchBalance() as Promise<BalanceType>,
    );
    this._balanceCache = { value: balance, expiresAt: Date.now() + 10_000 };
    return balance;
  }

  async getSwap(symbol: string[]): Promise<SwapType> {
    const response: Dictionary<Ticker> = await this._ccxt.fetchBidsAsks(symbol);
    const bidPrice = response[symbol[0]].bid;
    const askPrice = response[symbol[0]].ask;

    const result = {
      swap: `${askPrice - bidPrice}`,
    };
    return result;
  }

  async getTick(symbol: string): Promise<TickType> {
    const response: TickType = await this._readWithRetry('fetchTicker', () => this._ccxt.fetchTicker(symbol));
    return response;
  }

  async getPrice(symbol: string): Promise<number> {
    const ticker = await this.getTick(symbol);
    const price = +ticker.last!;

    return price;
  }

  async getOHLCVByTimeFrame(symbol: string, timeFrame: string): Promise<OHLCV[]> {
    const response: OHLCV[] = await this._ccxt.fetchOHLCV(symbol, timeFrame);
    return response;
  }

  async openLongMarketPosition(symbol: string, amount: number, any?: any): Promise<Order> {
    const response = await this._ccxt.createMarketBuyOrder(symbol, amount, any);
    return response;
  }

  async openShortMarketPosition(symbol: string, amount: number, any?: any): Promise<Order> {
    const response = await this._ccxt.createMarketSellOrder(symbol, amount, any);
    return response;
  }

  async openLimitLongPosition({ symbol, amount, price, params }: OpenPositionType): Promise<Order> {
    const response = await this._ccxt.createLimitBuyOrder(symbol, amount, price, params);
    return response;
  }

  async openLimitShortPosition({ symbol, amount, price, params }: OpenPositionType): Promise<Order> {
    const response = await this._ccxt.createLimitSellOrder(symbol, amount, price, params);
    return response;
  }

  async checkStatusOrderById(id: string, symbol: string): Promise<Order> {
    const response: Order = await this._readWithRetry('fetchOrder', () => this._ccxt.fetchOrder(id, symbol));
    return response;
  }

  private async _readWithRetry<T>(operation: string, request: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
        if (!this._isTransientExchangeError(error) || attempt === 5) throw error;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        console.warn(`${operation} transient failure; retrying in ${delay}ms (${attempt}/5):`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private _isTransientExchangeError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const transientNames = new Set([
      'DDoSProtection',
      'ExchangeNotAvailable',
      'NetworkError',
      'RateLimitExceeded',
      'RequestTimeout',
    ]);
    const code = (error as NodeJS.ErrnoException).code;
    return transientNames.has(error.name) || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code ?? '');
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    try {
      await this._ccxt.cancelAllOrders(symbol);
      return;
    } catch (bulkCancelError) {
      const openOrders = await this._ccxt.fetchOpenOrders(symbol).catch(() => {
        throw bulkCancelError;
      });
      if (!openOrders.length) return;

      await Promise.allSettled(openOrders.map((order) => this._ccxt.cancelOrder(order.id, symbol)));

      const remainingOrders = await this._ccxt.fetchOpenOrders(symbol);
      if (remainingOrders.length) {
        const remainingIds = remainingOrders.map((order) => order.id).join(', ');
        throw new Error(`Unable to cancel open orders for ${symbol}: ${remainingIds}`);
      }
    }
  }

  async createOrder({ symbol, type, side, amount, price, params }: CreateOpenPositionType): Promise<Order> {
    return await this._ccxt.createOrder(symbol, type, side, amount, price, params);
  }

  async createStopMarketOrder({ symbol, side, amount, price, params }: CreateOpenPositionType): Promise<Order> {
    return await this._ccxt.createMarketOrder(symbol, side, amount, price, params);
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    return await this._ccxt.fetchOpenOrders(symbol);
  }

  /**
   * @description this method get unrealized profit or loss
   * @param {string} symbol type string
   * @param {Order} order type Order
   * @returns {number} number floating is unrealized profit or loss
   */
  async getUnrealizedPnl(symbol: string, priceOrder: number, side: 'sell' | 'buy'): Promise<number> {
    const ticker = await this.getTick(symbol);
    const actualPriceMarket = ticker.last!;
    const calculate = actualPriceMarket - priceOrder;

    const unrealizedPnl = side === 'buy' ? calculate : -calculate;

    return unrealizedPnl;
  }

  async getInfoPrice(symbol: string, candlePriceRange: string): Promise<GetInfoPriceReturnedType> {
    const ticker = await this.getTick(symbol);
    const price: number = ticker.last!;
    const ohlc: OHLCV[] = await this.getOHLCVByTimeFrame(symbol, TimeFrame[candlePriceRange]);

    const prevCandleOHLC: OHLCV = ohlc[ohlc.length - 1];
    const highestInCandle: OHLCV = prevCandleOHLC[2];
    const lowestInCandle: OHLCV = prevCandleOHLC[3];
    const balance = await this.getBalance();

    console.log('ticker => ', ticker);
    console.log('price => ', price);
    console.log('prevDayOHLC => ', prevCandleOHLC);
    console.log('fiveDayHighest => ', highestInCandle);
    console.log('lowestInFiveDays => ', lowestInCandle);
    console.log('balance => ', balance);

    return {
      ticker,
      price,
      prevCandleOHLC,
      highestInCandle,
      lowestInCandle,
    };
  }
}
