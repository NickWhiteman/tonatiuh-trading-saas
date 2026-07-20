import { ConfigType } from 'repository/types/types';
import { ITrading } from '../../interfaces/ITrading';
import { OptionType, WatchingBuyBackLogicType, WatchingTakeProfitLogicType } from '../../types/types';
import { AbstractTradingClass } from '../abstract.trading';

export class TradingVectorProfitService extends AbstractTradingClass implements ITrading {
  constructor() {
    super();
  }

  /**
   * This method starting algorithm trading
   */
  async startAlgorithms(config: ConfigType): Promise<void> {
    try {
      this._config = config;
      this._SYMBOL = config.symbol;
      await this._initGeneralUtils(config);
      await this._ConfigService.recordLogger(this._loggerIdentity, this._config.id);
      console.log(`=> AbstractTradingClass initialized!`);

      await this._startTradingSession({
        typeTrading: 'one-trade',
        watchingTakeProfitLogic: async (param: WatchingTakeProfitLogicType) =>
          await this._watchingTakeProfitLogic(param),
        watchingBuyBackLogic: async (param: WatchingBuyBackLogicType) => await this._watchingBuyBackLogic(param),
      });
    } catch (error: unknown) {
      const { message } = error as { message: string };
      console.log(
        `
          ${error}
          ${message}
        `,
      );
    }
  }

  private async _watchingTakeProfitLogic({
    side,
    profitPrice,
    unrealizedPnl,
    settingTakeProfit,
  }: WatchingTakeProfitLogicType): Promise<boolean> {
    if (unrealizedPnl >= profitPrice * this._config.percentProfit) {
      if (this._config.isPercentTargetAfterTakeProfit) {
        const resultTakeProfitBehavior = await this._onPriceTracker({
          side: side === 'sell' ? 'buy' : 'sell',
          settingOrder: settingTakeProfit,
        });

        if (resultTakeProfitBehavior) {
          console.log('======> TakeProfit close all positions!');
          return true;
        }
      }

      if (!this._config.isPercentTargetAfterTakeProfit) {
        await this._openPositionForStrategy({
          side: side === 'sell' ? 'buy' : 'sell',
          settingOrder: settingTakeProfit,
        });
        console.log('======> TakeProfit close all positions!');
        return true;
      }
    }

    return false;
  }

  private async _watchingBuyBackLogic({
    unrealizedPnl,
    buyingBack,
    balance,
    nativeCurrency,
    convertValue,
    side,
    lastPrice,
    options,
  }: WatchingBuyBackLogicType): Promise<OptionType | false> {
    if (unrealizedPnl <= -buyingBack) {
      const amountForBuyBack =
        (balance[nativeCurrency].free * this._config.percentFromBalance) / convertValue > 10 / convertValue
          ? (balance[nativeCurrency].free * this._config.percentFromBalance) / convertValue
          : 0;

      if (amountForBuyBack !== 0) {
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

      return options;
    }

    return false;
  }

  /**
   * This method finishing algorithm trading
   */
  async endAlgorithms(): Promise<void> {
    await this._OrdersOperationService.cancelAllOrders(this._SYMBOL);
  }
}
