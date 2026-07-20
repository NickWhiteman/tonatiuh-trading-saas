import { Order } from 'ccxt';

import { IOrdersOperationService } from '../../interfaces/IOrdersOperationService';
import {
  CheckingExistingOrdersType,
  CreateOpenPositionType,
  ModeType,
  OpenFirstPositionType,
  OpenLimitPositionByGridLineType,
  OpenPositionForStrategyType,
  OpenPositionType,
  OpenStopMarketPositionByGridLineType,
  SettingOrderType,
} from '../../types/types';
import { ExchangeService } from '../ExchangeService/ExchangeService';
import { ConfigType, CreateOrderParamsType, OrderType } from '../../repository/types/types';
import { OrderRepository } from '../../repository/repository/order.repository';
import { IExchangeService } from 'interfaces';
import { DatabaseService } from '../../utils/DatabaseService/DatabaseService';
import { OrderService } from '../../utils/OrderService/OrderService';
import { GetDatabaseList } from '../../plugins/FileSystemUtils/GetFileSystem/GetDatabaseList';

/**
 * @description OrdersOperationService implemets logics open positions for starting trading. And methods whitch for wrapper ExchangeService
 *
 * This methods can be reused in other strategies.
 */
export class OrdersOperationService implements IOrdersOperationService {
  public orders: OrderType[];
  private _ExchangeService: IExchangeService;
  private _OrderService: OrderService;
  private _config: ConfigType;

  constructor(config: ConfigType) {
    this.orders = [];
    const { exchange, apiKey, privateKey, password } = config;
    this._config = config;
    const databaseList = new GetDatabaseList().getDatabaseList();
    this._ExchangeService = new ExchangeService(exchange, apiKey, privateKey, password);
    this._OrderService = new OrderService(databaseList[config.id.toString()]);
  }
  public async setOrders(orders: OrderType[]): Promise<void> {
    this.orders = orders;
  }

  public async getAllOrdersByIndexOperation(indexSession: string): Promise<OrderType[] | undefined> {
    const result = await this._OrderService.getAllOrdersByIndexOperation(indexSession);
    return result;
  }

  public async getProfitForTradeSession(indexOperation: string, side: ModeType, orders: OrderType[]): Promise<number> {
    const result = await this._OrderService.getProfitForTradeSession(indexOperation, side, orders);
    return result;
  }

  /**
   *
   * @param {OpenStopMarketPositionByGridLineType} OpenStopMarketPositionByGridLineType object setting for working logic for open positons
   * @returns {Promise<Order[]>} promise array orders
   */
  async openStopMarketPositionByGridLineByuHightSellLowActualPrice({
    mode,
    symbol,
    positionSize,
    ticker,
    gridSize,
    numberGridLines,
  }: OpenStopMarketPositionByGridLineType): Promise<void> {
    const tickPrice = ticker.last!;

    for (let i = 0; i < numberGridLines; i++) {
      const condutionPriceOpen = numberGridLines === 1 ? 1 : i * 2;
      const price = tickPrice + (mode === 'buy' ? gridSize * condutionPriceOpen : -(gridSize * condutionPriceOpen));
      console.log(`submitting market limit ${mode} order at ${price}`);

      this.orders.push(
        await this.openStopMarketPosition({
          type: 'limit',
          symbol: symbol,
          side: mode,
          amount: positionSize,
          price: price,
          params: {
            stopPrice: price,
          },
        }),
      );
    }
  }

  /**
   *
   * @param {OpenLimitPositionByGridLineType} OpenLimitPositionByGridLineType object setting for working logic for open positons
   * @returns {Promise<Order[]>} promise array orders
   */
  async openLimitPositionByGridLineBuyLowSellHight({
    mode,
    symbol,
    positionSize,
    ticker,
    gridSize,
    numberGridLines,
  }: OpenLimitPositionByGridLineType): Promise<void> {
    const tickPrice = ticker.last!;

    for (let i = 1; i <= numberGridLines; i++) {
      const gridSizeForSizeOpen = mode === 'buy' ? -(gridSize * i) : gridSize * i;
      const price = tickPrice + gridSizeForSizeOpen;
      console.log(`submitting market limit ${mode} order at ${price}`);

      const positionData: OpenPositionType = {
        symbol: symbol,
        amount: positionSize,
        price: price,
      };
      const order: Order = await this._openLimitPositionByModeBuyOpenLongSellOpenShort(mode, positionData);
      this.orders.push(order);

      return order;
    }
  }

  /**
   * @description method for cancel not open order (on exchange this behavior order have status = 'open')
   * @param {string } symbol example 'ETH/USDT' - currency symbol
   */
  async cancelAllOrders(symbol: string): Promise<void> {
    await this._ExchangeService.cancelAllOrders(symbol);
  }

  async checkStatusOrderById(orderId: string, symbol: string): Promise<Order> {
    return this._ExchangeService.checkStatusOrderById(orderId, symbol);
  }

  /**
   * @description method create order or stop order on market price or limit order
   * @param {CreateOpenPositionType} CreateOpenPositionType object setting for open orders
   * @returns {Order} object Order
   */
  async createMarketOrLimitOrStopOrder(settings: CreateOpenPositionType): Promise<Order> {
    return this._ExchangeService.createOrder(settings);
  }

  async openStopMarketPosition(positionData: CreateOpenPositionType): Promise<Order> {
    return await this._ExchangeService.createStopMarketOrder(positionData);
  }

  private async _openLimitPositionByModeBuyOpenLongSellOpenShort(
    mode: string,
    positionData: OpenPositionType,
  ): Promise<Order> {
    return mode === 'buy'
      ? await this._ExchangeService.openLimitLongPosition(positionData)
      : await this._ExchangeService.openLimitShortPosition(positionData);
  }

  public async checkingExistingOrders({
    watchingProcessParam,
    watchingProcess,
    symbol,
    indexOperation,
  }: CheckingExistingOrdersType): Promise<void> {
    const ordersFromDB: OrderType[] | undefined = await this._OrderService.getAllOrdersByIndexOperation(indexOperation);
    if (ordersFromDB === undefined || !ordersFromDB.length) {
      return;
    }

    let amountAllOrders = 0;
    for (const order of ordersFromDB) {
      amountAllOrders += order.amount;
    }
    this.setOrders(ordersFromDB);
    await watchingProcess({
      ...watchingProcessParam,
      settingForFirstOrder: {
        symbol: symbol,
        type: 'limit',
        amount: amountAllOrders,
        price: ordersFromDB[0].price,
      },
      firstOrder: ordersFromDB[0],
      price: ordersFromDB[0].price,
    });
  }

  public async getOrderByOrderId(orderId: string): Promise<OrderType | undefined> {
    return await this._OrderService.findOrderById(orderId);
  }

  public async revertActiveStateOrder(indexOperation: string): Promise<void> {
    await this._OrderService.revertOrderActiveStatus(indexOperation);
  }

  public async openFirstPosition({
    settingForFirstOrder,
    price,
    lowestInCandle,
    highestInCandle,
    indexOperation,
  }: OpenFirstPositionType): Promise<Order> {
    let firstOrder: Order;
    if (this._config.isOnlyBuy) {
      firstOrder = await this.openPositionForStrategy({
        side: 'buy',
        settingOrder: settingForFirstOrder,
        indexOperation,
      });

      return firstOrder;
    }

    if (price >= lowestInCandle && price <= highestInCandle) {
      const sellSide = price - lowestInCandle;
      const buySide = highestInCandle - price;

      if (buySide > sellSide) {
        firstOrder = await this.openPositionForStrategy({
          side: 'sell',
          settingOrder: settingForFirstOrder,
          indexOperation,
        });
      } else {
        firstOrder = await this.openPositionForStrategy({
          side: 'buy',
          settingOrder: settingForFirstOrder,
          indexOperation,
        });
      }
    }

    if (price < lowestInCandle) {
      firstOrder = await this.openPositionForStrategy({
        side: 'buy',
        settingOrder: settingForFirstOrder,
        indexOperation,
      });
    }

    if (price > highestInCandle) {
      firstOrder = await this.openPositionForStrategy({
        side: 'sell',
        settingOrder: settingForFirstOrder,
        indexOperation,
      });
    }

    if (!('id' in firstOrder)) {
      throw new Error('Not found first order id!');
    }

    return firstOrder;
  }

  public async clearingOrderList() {
    this.orders = [];
  }

  public async openPositionForStrategy({
    side,
    settingOrder,
    indexOperation,
  }: OpenPositionForStrategyType): Promise<Order> {
    const newOrder = await this._openPositionForAlgorithm({
      ...settingOrder,
      side: side,
    });

    await this._saveActivatedOrder({
      order: newOrder,
      orderId: newOrder.id,
      price: settingOrder.price,
      amount: settingOrder.amount,
      side: side,
      symbol: newOrder.symbol,
      indexOperation: indexOperation,
    });

    this.orders.push(newOrder);

    return newOrder;
  }

  private async _openPositionForAlgorithm(params: CreateOpenPositionType): Promise<Order> {
    const order = await this._ExchangeService.createOrder(params);

    return order;
  }

  private async _saveActivatedOrder(operation: CreateOrderParamsType): Promise<
    | {
        message: string;
      }
    | undefined
  > {
    return await this._OrderService.createOrder(operation);
  }
}
