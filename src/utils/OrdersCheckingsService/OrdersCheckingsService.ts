import { Order } from 'ccxt';
import { IOrderCheckingService } from '../../interfaces/IOrderCheckingService';
import {
  CheckingOrderType,
  CreateOpenPositionType,
  ModeType,
  OpenPositionType,
  ParametersForCheckingOrdersForOpenOpposideSideType,
  ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType,
} from '../../types/types';
import { ExchangeService } from '../ExchangeService/ExchangeService';
import { OrdersOperationService } from '../OrdersOperationService/OrdersOperationService';
import { ConfigType } from 'repository/types/types';
import { IExchangeService, IOrdersOperationService } from 'interfaces';

/**
 * @description OrdersCheckingService implements methods for checking logics trading
 */
export class OrdersCheckingService implements IOrderCheckingService {
  // these instances will be separate http requests
  private _ExchangeService: IExchangeService;
  private _OrdersOperationService: IOrdersOperationService;

  constructor(config: ConfigType) {
    const { exchange, apiKey, privateKey, password } = config;
    this._ExchangeService = new ExchangeService(exchange, apiKey, privateKey, password);
    this._OrdersOperationService = new OrdersOperationService(config);
  }

  /**
   * @description This method makes a check on the status of orders, if the position status is closed opens a new limit order
   * @param {ParametersForCheckingOrdersForOpenOpposideSideType} objectParams inclides mode, symbol, positionSize, gridSize, ordersForChecking
   * @returns {CheckingOrderType} object includes array new  open orders and array closedOrdersId
   */
  async checkingOrdersWhenOrderStatusCloseCreateNewOrderForLiqudationOpenPositionsOnExchange({
    mode,
    symbol,
    positionSize,
    gridSize,
    ordersForChecking,
  }: ParametersForCheckingOrdersForOpenOpposideSideType): Promise<CheckingOrderType> {
    const result: CheckingOrderType = {
      orders: [],
      closedOrderIds: [],
    };
    const { orders, closedOrderIds } = result;

    for (const orderData of ordersForChecking) {
      console.log(`checking ${mode} order ${orderData.id}`);

      try {
        const order: Order = await this._ExchangeService.checkStatusOrderById(orderData.id, symbol);

        if (order.status === 'closed') {
          closedOrderIds.push(order.id);
          console.log(`${mode} order executed at ${order.price}`);

          // TODO: Remove the calculation of the average value. Switch margin mode
          const increaseAveragePosition = ordersForChecking.indexOf(order) + 1;

          const averagePosition = positionSize * increaseAveragePosition + gridSize;

          const newPrice = order.price + (mode === 'buy' ? averagePosition : -averagePosition);
          console.log(`creating new limit ${mode} order at ${newPrice}`);

          const newOrder = await this._OrdersOperationService.createMarketOrLimitOrStopOrder({
            type: 'limit',
            side: mode === 'buy' ? 'sell' : 'buy',
            symbol: symbol,
            amount: positionSize,
            price: newPrice,
          });
          orders.push(newOrder as Order);
        }
      } catch (error) {
        console.log(`request failed: ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    return result;
  }

  /**
   * @description This method checks an array of orders until it reaches takeProfit price or stopLoss price
   * @param {ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType} objectParams includes symbol, positionSize, order, takeProfit, stopLoss
   * @returns {Order} return order which was finished first takeProfit or stopLoss
   */
  async checkWhichOrderActivatedHowPositionsClosedWaitingResult({
    symbol,
    positionSize,
    order,
    takeProfit,
    stopLoss,
  }: ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType): Promise<Order> {
    const tradeSummary: Order[] = [];
    const orderStatus = await this._OrdersOperationService.checkStatusOrderById(order.id, symbol);

    if (orderStatus.status === 'closed') {
      await this._OrdersOperationService.cancelAllOrders(symbol);

      const unrealizedPnl = await this._ExchangeService.getUnrealizedPnl(symbol, orderStatus.price, orderStatus.side);
      console.log(`%cunrealizedPnl ${unrealizedPnl}`, `color: ${unrealizedPnl > 0 ? 'green' : 'red'}`);

      const actualTicker = await this._ExchangeService.getTick(symbol);
      const actualPriceMarket = actualTicker.last!;

      if (unrealizedPnl >= takeProfit || unrealizedPnl <= stopLoss) {
        console.log(
          `%c takeProfit unrealizedPnl > ${unrealizedPnl >= takeProfit ? takeProfit : stopLoss}`,
          `color: ${unrealizedPnl >= takeProfit ? 'green' : 'red'}`,
        );
        tradeSummary.push(
          await this._OrdersOperationService.openStopMarketPosition({
            type: 'market',
            symbol: symbol,
            side: orderStatus.side === 'buy' ? 'sell' : 'buy',
            amount: positionSize,
            price: actualPriceMarket,
          }),
        );
      }
    }

    return tradeSummary[0];
  }

  // async checkPositionForSpotExchangeOkxVectorProfit({ symbol, price, side, orders }) {
  //   const lastPrice = (await this._AdditionExchangeService.getTicker(symbol)).last!;
  //   const unrealizedPnl = await this._AdditionExchangeService.getUnrealizedPnl(symbol, price, side);
  //   console.log('unrealizedPnl => ', unrealizedPnl);
  //   console.log('lastPrice => ', lastPrice);
  //   console.log('orders => ', orders);

  //   if (unrealizedPnl >= price * 0.001) {
  //     await this._openPositionForStrategy(
  //       this._orders[this._orders.length - 1].side === 'sell' ? 'buy' : 'sell',
  //       settingTakeProfit,
  //       {
  //         revertOrder: firstOrder,
  //       },
  //     );
  //     console.log('======> TakeProfit close position');
  //     break;
  //   }

  //   if (unrealizedPnl <= -(price * 0.001)) {
  //     const amountForBuyBack =
  //       (balance as any)[this._orders[orders.length - 1].side === 'sell' ? 'USDT' : 'ETH'].free * 0.001;

  //     await this._openPositionForStrategy(orders[orders.length - 1].side, {
  //       symbol,
  //       type: 'market',
  //       price: price - price * 0.001,
  //       amount: amountForBuyBack,
  //     });

  //     options.buyingBack += amountForBuyBack;
  //     console.log('======> Open new position!');
  //   }
  // }
}
