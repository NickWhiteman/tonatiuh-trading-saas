import { Order, Ticker } from 'ccxt';

import {
  BalanceType,
  GetDeltaParamType,
  GetInfoPriceReturnedType,
  ModeType,
  OpenLimitPositionParameterType,
  OptionType,
  PriceTrackerParamType,
  ReturnCurrencyBreakdown,
  SettingOrderType,
  StartAlgorithmsType,
  WatchingProcessParamType,
} from '../types/types';
import { OrdersOperationService } from '../utils/OrdersOperationService/OrdersOperationService';
import { ExchangeService } from '../utils/ExchangeService/ExchangeService';
import { EmergencyStopService } from '../utils/EmergencyStop/EmergencyStopService';
import { SessionTradingService } from '../utils/SessionTrading/SessionTradingService';
import {
  IEmergencyStopService,
  IExchangeService,
  IOrderCheckingService,
  IOrdersOperationService,
  ISessionTradingService,
} from 'interfaces';
import { ILoggerService } from 'interfaces/ILoggerService';
import { ConfigType } from '../repository/types/types';
import { ConfigRepository } from '../repository/repository/config.repository';
import { GenerateIdentity } from '../plugins/GenerateIdentity/GenerateIdentity';
import { ConfigService } from '../utils/ConfigService/ConfigService';
import { LoggerService } from '../utils/LoggerService/LoggerService';
import { ENV } from '../plugins/Environment/const';
import { OrdersCheckingService } from '../utils/OrdersCheckingsService/OrdersCheckingsService';

export abstract class AbstractTradingClass {
  protected _indexOperation: string;
  protected _SYMBOL: string;
  protected _config: ConfigType;

  protected _OrdersOperationService: IOrdersOperationService;
  protected _ExchangeService: IExchangeService;
  protected _EmergencyStopService: IEmergencyStopService;
  protected _SessionTradingService: ISessionTradingService;
  protected _LoggerService: ILoggerService;
  protected _OrdersCheckingService: IOrderCheckingService;

  protected _ConfigService: ConfigRepository;

  protected _loggerIdentity: string;
  private _takerFee: number;

  constructor() {
    this._takerFee = 0.01;
    this._ConfigService = new ConfigService();
  }

  /**
   * @param typeTrading - flag trading behavior 'one-trade' or 'grid'
   * @param watchingTakeProfitLogic - watching take profit logic call in _watchingProcess
   * @param watchingBuyBackLogic - watching buyback logic call in _watchingProcess
   * @param watchingGridLogic - watching grid logic call in _watchingProcess
   * @returns void
   */
  protected async _startTradingSession(param: StartAlgorithmsType): Promise<void> {
    setTimeout(async () => {
      const { indexOperation, typeSession } = await this._SessionTradingService.initTradeSession();
      this._indexOperation = indexOperation;
      console.log('_startAlgorithms behaviorPointer => ', indexOperation);
      if (typeSession === 'startNewTrade') {
        await this._startNewTrade(param);
        return;
      }
      if (typeSession === 'startOldTrade') {
        await this._OrdersOperationService.checkingExistingOrders({
          symbol: this._SYMBOL,
          indexOperation: this._indexOperation,
          watchingProcessParam: param,
          watchingProcess: async (param: WatchingProcessParamType) => await this._watchingProcess(param),
        });
        return;
      }
    }, 5000);
  }

  abstract endAlgorithms(): void;

  protected async _openLimitPosition(params: OpenLimitPositionParameterType): Promise<void> {
    await this._OrdersOperationService.openLimitPositionByGridLineBuyLowSellHight({
      ...params,
      mode: params.side,
      symbol: this._SYMBOL,
    });
  }

  protected async _sleepTimeout(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async _getCurrencyBreakdown(symbol: string): Promise<ReturnCurrencyBreakdown> {
    const firstCurrency = symbol.slice(0, symbol.indexOf('/'));
    const secondCurrency = symbol.slice(symbol.indexOf('/') + 1, symbol.length);

    return {
      firstCurrency,
      secondCurrency,
    };
  }

  protected async _enteringPosition(param: StartAlgorithmsType): Promise<WatchingProcessParamType> {
    const { typeTrading } = param;

    if (typeTrading === 'one-trade') {
      return await this._oneTradingBehavior(param);
    }

    return await this._gridTradingBehavior(param);
  }

  protected async _openPositionForStrategy({ side, settingOrder }: { side: ModeType; settingOrder: SettingOrderType }) {
    await this._OrdersOperationService.openPositionForStrategy({
      side,
      settingOrder,
      indexOperation: this._indexOperation,
    });
  }

  protected async _getPrice() {
    const ticker = await this._ExchangeService.getTick(this._SYMBOL);
    const price = +ticker.last!;

    return price;
  }

  protected async _reloadConfig(configId: number): Promise<void> {
    await this._ConfigService.getConfigById(configId).then(async (config) => {
      if (!config) {
        return;
      }

      this._config = config;
      console.log(`=> Config reload!`);
    });
  }

  protected async _initGeneralUtils(config: ConfigType) {
    const { apiKey, privateKey, password, symbol, exchange } = config;
    this._SYMBOL = symbol;
    this._EmergencyStopService = new EmergencyStopService();
    this._ExchangeService = new ExchangeService(exchange, apiKey, privateKey, password);
    this._OrdersOperationService = new OrdersOperationService(config);
    this._SessionTradingService = new SessionTradingService(config);
    this._OrdersCheckingService = new OrdersCheckingService(config);
    this._LoggerService = new LoggerService(+ENV.PORT + config.id);
    this._loggerIdentity = `trading-service-${new GenerateIdentity(15).generateIdentity()}-${this._SYMBOL}`;
  }

  protected async _onPriceTracker({ side, settingOrder }: PriceTrackerParamType) {
    try {
      console.log('start _onPriceTracker => ');
      const price = await this._getPrice();
      console.log('price => ', price);
      const reversePriceIndent = price * this._config.percentTargetAfterTakeProfit;
      console.log('reversePriceIndent => ', reversePriceIndent);

      function calculateTarget(mode: 'take' | 'stop', actualPrice: number) {
        return mode === 'take'
          ? side === 'sell'
            ? actualPrice + reversePriceIndent
            : actualPrice - reversePriceIndent
          : side === 'sell'
          ? actualPrice - reversePriceIndent
          : actualPrice + reversePriceIndent;
      }

      let targetTakeProfit = calculateTarget('take', price);
      let targetStopProfit = calculateTarget('stop', price);
      console.log('targetTakeProfit => ', { targetTakeProfit });
      console.log('targetStopProfit => ', { targetStopProfit });

      while (true) {
        if (!this._OrdersOperationService.orders.length) {
          throw new Error('Orders not found!');
        }

        const lastPrice = await this._getPrice();
        const unrealizedPnl = await this._ExchangeService.getUnrealizedPnl(
          this._SYMBOL,
          this._OrdersOperationService.orders[0].price,
          this._OrdersOperationService.orders[0].side,
        );

        if ((side === 'sell' && lastPrice <= targetStopProfit) || (side === 'buy' && lastPrice >= targetStopProfit)) {
          await this._openPositionForStrategy({
            side,
            settingOrder: { ...settingOrder, price: lastPrice },
          });
          console.log('Tracker done!');
          return true;
        }

        if ((side === 'sell' && lastPrice >= targetTakeProfit) || (side === 'buy' && lastPrice <= targetTakeProfit)) {
          targetTakeProfit = calculateTarget('take', lastPrice);
          targetStopProfit = calculateTarget('stop', lastPrice);
          console.log('changes targetTakeProfit => ', { targetTakeProfit });
          console.log('changes targetStopProfit => ', { targetStopProfit });
        }

        console.log('==================================');
        console.log('_onPriceTracker => ');
        console.log('unrealizedPnl => ', unrealizedPnl);
        console.log('targetTakeProfit => ', targetTakeProfit);
        console.log('targetStopProfit => ', targetStopProfit);
        console.log('lastPrice => ', lastPrice);
        console.log('==================================');

        this._sleepTimeout(1000);
      }
    } catch (error) {
      const { message } = error as { message: string };
      if (message !== 'Price not actual logic!' || 'Orders not found!') {
        console.error(message);
      }

      return false;
    }
  }

  private async _oneTradingBehavior(param: StartAlgorithmsType): Promise<WatchingProcessParamType> {
    const { price, highestInCandle, lowestInCandle }: GetInfoPriceReturnedType =
      await this._ExchangeService.getInfoPrice(this._SYMBOL, this._config.candlePriceRange);

    const settingForFirstOrder: SettingOrderType = {
      symbol: this._SYMBOL,
      type: 'limit',
      amount: this._config.positionSize,
      price: +price,
    };

    const firstOrder: Order = await this._OrdersOperationService.openFirstPosition({
      settingForFirstOrder,
      price,
      highestInCandle,
      lowestInCandle,
      indexOperation: this._indexOperation,
    });

    return { ...param, settingForFirstOrder, firstOrder, price };
  }

  private async _gridTradingBehavior(param: StartAlgorithmsType): Promise<WatchingProcessParamType> {
    const sideMode: ModeType[] = ['buy', 'sell'];
    const { countGridSize, gridSize, positionSize } = this._config;
    const ticker: Ticker = await this._ExchangeService.getTick(this._SYMBOL);

    if (!countGridSize || !gridSize) {
      throw new Error('Parameters countGridSize or gridSize must be provided.');
    }

    for (const side of sideMode) {
      for (let i = 0; i < countGridSize; i++) {
        const conditionPriceOpen = countGridSize === 1 ? 1 : i * 2;
        const tickPrice = +ticker.last!;
        const price = tickPrice + (side === 'buy' ? gridSize * conditionPriceOpen : -(gridSize * conditionPriceOpen));

        await this._openPositionForStrategy({
          side,
          settingOrder: {
            symbol: this._SYMBOL,
            type: 'limit',
            amount: positionSize,
            price: price,
          },
        });
      }
    }

    return { ...param } as unknown as WatchingProcessParamType;
  }

  private async _watchingProcess(param: WatchingProcessParamType): Promise<void> {
    const {
      settingForFirstOrder,
      firstOrder,
      price,
      watchingTakeProfitLogic,
      watchingBuyBackLogic,
      watchingGridLogic,
    } = param;
    const options: OptionType = {
      buyingBack: settingForFirstOrder ? +settingForFirstOrder.amount : 0,
      drawdownStep: this._OrdersOperationService.orders.length ?? 1,
    };

    while (this._OrdersOperationService.orders.length !== 0) {
      await this._reloadConfig(this._config.id);
      const balance: BalanceType = await this._ExchangeService.getBalance();
      const side = this._OrdersOperationService.orders[this._OrdersOperationService.orders.length - 1].side;
      const unrealizedPnl = await this._ExchangeService.getUnrealizedPnl(
        this._SYMBOL,
        settingForFirstOrder ? settingForFirstOrder.price : this._OrdersOperationService.orders[0].price,
        firstOrder ? firstOrder.side : this._OrdersOperationService.orders[0].side,
      );
      const buyBackPrice = price * (this._config.percentBuyBackStep * options.drawdownStep);
      const { firstCurrency, secondCurrency } = await this._getCurrencyBreakdown(this._SYMBOL);
      const nativeCurrency = side === 'sell' ? firstCurrency : secondCurrency;
      const lastPrice = await this._ExchangeService.getPrice(this._SYMBOL);
      const profitPrice =
        price +
        // only sui или монеты с ценой меньше 10 долларов
        (firstOrder.side === 'sell' ? -(price * this._config.percentProfit) : price * this._config.percentProfit);
      const deltaForSale = await this._getDeltaForSale({ side, buyingBack: options.buyingBack, price, lastPrice });
      const deltaForBuy = await this._getDeltaForBuy({ side, buyingBack: options.buyingBack, price, lastPrice });
      const convertValue = side === 'buy' ? 1 : lastPrice;
      const settingTakeProfit: SettingOrderType = {
        ...settingForFirstOrder,
        amount: side === 'sell' ? options.buyingBack + deltaForSale : options.buyingBack - deltaForBuy,
      };

      if (this._config.isEmergencyStop) {
        await this._ConfigService.disableEmergencyStop();
        break;
      }

      if (
        (this._config.isCapitalizeDeltaFromSale && isNaN(deltaForSale)) ||
        (this._config.isCoinAccumulation && isNaN(deltaForBuy))
      ) {
        throw new Error('Delta is not a number!');
      }

      await this._LoggerService.loggerStrategy({
        _identity: this._loggerIdentity,
        balance,
        price,
        unrealizedPnl,
        lastPrice,
        side,
        profitPrice,
        percentProfit: this._config.percentProfit,
        percentBuyBackStep: this._config.percentBuyBackStep,
        percentFromBalance: this._config.percentFromBalance,
        takerFee: this._takerFee,
        options,
        orders: this._OrdersOperationService.orders,
        deltaForSale,
        deltaForBuy,
        firstCurrency,
        secondCurrency,
        configId: this._config.id,
      });

      if (!watchingGridLogic) {
        const paramTakeProfitLogic = {
          side,
          profitPrice,
          unrealizedPnl,
          settingTakeProfit,
          buyingBack: options.buyingBack,
        };
        const resultTakeProfitBehavior = watchingTakeProfitLogic
          ? await watchingTakeProfitLogic(paramTakeProfitLogic)
          : false;

        if (resultTakeProfitBehavior) {
          await this._endTradeSession(deltaForSale);
          break;
        }

        if (unrealizedPnl <= -buyBackPrice) {
          let amountForBuyBack;
          if (this._config.isFibonacci) {
            // With fibonacci
            const unrealizedValue = (this._config.positionSize * lastPrice * options.drawdownStep) / convertValue;
            console.log('unrealizedValue => ', balance[nativeCurrency].free - unrealizedValue);
            amountForBuyBack =
              balance[nativeCurrency].free - unrealizedValue >= 0
                ? side === 'buy'
                  ? unrealizedValue / lastPrice
                  : unrealizedValue
                : 0;
          } else {
            // Without fibonacci
            amountForBuyBack =
              (balance[nativeCurrency].free * this._config.percentFromBalance) / convertValue > 0
                ? (balance[nativeCurrency].free * this._config.percentFromBalance) / convertValue
                : 0;
          }

          if (amountForBuyBack > 0) {
            await this._openPositionForStrategy({
              side,
              settingOrder: {
                symbol: this._SYMBOL,
                type: 'limit',
                price: lastPrice,
                amount: amountForBuyBack,
              },
            });
            options.drawdownStep++;
            options.buyingBack += amountForBuyBack;
            console.log('======> Open new position!');
          }
        }
      }

      if (watchingGridLogic) {
        await watchingGridLogic();
        break;
      }

      await this._sleepTimeout(1000);
    }
  }

  private async _getDeltaForSale({ side, buyingBack, price, lastPrice }: GetDeltaParamType): Promise<number> {
    return side === 'sell' && this._config.isCapitalizeDeltaFromSale
      ? (this._OrdersOperationService.orders.reduce((prev, curr) => {
          const delta = curr.amount * curr.price;
          return prev + delta;
        }, 0) -
          buyingBack * price) /
          lastPrice
      : 0;
  }

  private async _getDeltaForBuy({ side, buyingBack, price, lastPrice }: GetDeltaParamType): Promise<number> {
    return side === 'buy' && this._config.isCoinAccumulation
      ? (buyingBack * price -
          this._OrdersOperationService.orders.reduce((prev, curr) => {
            const delta = curr.amount * curr.price;
            return prev + delta;
          }, 0)) /
          lastPrice
      : 0;
  }

  private async _startNewTrade(params: StartAlgorithmsType): Promise<void> {
    console.log('_startNewTrade working! =>');
    const paramsWatchingProcess: WatchingProcessParamType = await this._enteringPosition(params);
    await this._watchingProcess(paramsWatchingProcess);
  }

  private async _endTradeSession(deltaForSale: number): Promise<void> {
    const calculateProfitSession =
      (await this._SessionTradingService.calculateProfitSession(
        this._indexOperation,
        this._OrdersOperationService.orders,
      )) + deltaForSale;
    console.log('_calculateProfitSession =>');
    await this._SessionTradingService.saveBalanceState(calculateProfitSession, this._OrdersOperationService.orders);
    console.log('_saveBalanceState =>');
    await this._SessionTradingService.endTradeSession(calculateProfitSession, this._indexOperation);
    console.log('endTradeSession =>');
    await this._OrdersOperationService.revertActiveStateOrder(this._indexOperation);
    console.log('_revertActiveStateOrder =>');
    await this._OrdersOperationService.clearingOrderList();
    console.log('_clearingOrderList =>');
  }
}
